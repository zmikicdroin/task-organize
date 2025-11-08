class PhotoKanban {
    constructor() {
        this.photos = { todo: [], doing: [], done: [] };
        this.isMobile = window.innerWidth <= 768;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadPhotos();
        
        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 768;
        });
    }

    setupEventListeners() {
        const uploadInput = document.getElementById('photo-upload');
        uploadInput.addEventListener('change', (e) => this.handleUpload(e));
    }

    async loadPhotos() {
        try {
            const response = await fetch('/api/photos');
            this.photos = await response.json();
            this.renderPhotos();
        } catch (error) {
            console.error('Error loading photos:', error);
            this.showToast('Error loading photos');
        }
    }

    async handleUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const formData = new FormData();
        
        for (let i = 0; i < files.length; i++) {
            formData.append('photos', files[i]);
        }

        try {
            this.showToast(`Uploading ${files.length} photo${files.length > 1 ? 's' : ''}...`);
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (result.success) {
                for (let i = result.photos.length - 1; i >= 0; i--) {
                    this.photos.todo.unshift(result.photos[i]);
                }
                this.renderPhotos();
                this.showToast(`${result.count} photo${result.count > 1 ? 's' : ''} uploaded successfully! 🎉`);
            } else {
                this.showToast('Upload failed: ' + result.error);
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showToast('Upload failed');
        }

        event.target.value = '';
    }

    renderPhotos() {
        ['todo', 'doing', 'done'].forEach(category => {
            const container = document.getElementById(`${category}-container`);
            const photos = this.photos[category];
            
            const column = document.querySelector(`.column[data-category="${category}"]`);
            const countEl = column.querySelector('.count');
            countEl.textContent = photos.length;

            if (photos.length === 0) {
                container.innerHTML = '<div class="empty-state">No photos yet</div>';
                return;
            }

            container.innerHTML = photos.map(photo => this.createPhotoCard(photo, category)).join('');

            container.querySelectorAll('.photo-card').forEach(card => {
                this.setupPhotoEvents(card);
            });
        });
    }

    createPhotoCard(photo, category) {
        let buttons = '';
        let overlays = '';
        
        if (category === 'todo') {
            buttons = `<button class="action-btn btn-doing" data-action="doing">Doing →</button>
                       <button class="action-btn btn-done" data-action="done">← Done</button>`;
            overlays = `<div class="swipe-overlay left" data-target="done">✅</div>
                        <div class="swipe-overlay right" data-target="doing">⚡</div>`;
        } else if (category === 'doing') {
            buttons = `<button class="action-btn btn-todo" data-action="todo">← To Do</button>
                       <button class="action-btn btn-done" data-action="done">Done →</button>
                       <button class="action-btn btn-delete" data-action="delete">✕</button>`;
            overlays = `<div class="swipe-overlay left todo-overlay" data-target="todo">📋</div>
                        <div class="swipe-overlay right" data-target="done">✅</div>`;
        } else if (category === 'done') {
            buttons = `<button class="action-btn btn-doing" data-action="doing">← Doing</button>
                       <button class="action-btn btn-delete" data-action="delete">Archive →</button>`;
            overlays = `<div class="swipe-overlay left doing-overlay" data-target="doing">⚡</div>
                        <div class="swipe-overlay right delete-overlay" data-target="delete">📦</div>`;
        }

        return `
            <div class="photo-card" data-photo-id="${photo.id}" data-category="${category}">
                <img src="${photo.url}" alt="Photo" loading="lazy" draggable="false">
                <div class="photo-actions">
                    ${buttons}
                </div>
                ${overlays}
            </div>
        `;
    }

    setupPhotoEvents(card) {
        const photoId = card.dataset.photoId;
        const category = card.dataset.category;

        // Button clicks (desktop)
        card.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const action = btn.dataset.action;
                
                if (action === 'delete') {
                    this.deletePhoto(photoId, card);
                } else {
                    this.movePhoto(photoId, action);
                }
            });
        });

        // Overlay button clicks (desktop hover)
        card.querySelectorAll('.swipe-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                const target = overlay.dataset.target;
                if (target === 'delete') {
                    this.deletePhoto(photoId, card);
                } else if (target) {
                    this.movePhoto(photoId, target);
                }
            });
        });

        // Touch/Pointer events (mobile and desktop swipe) - for all categories
        if (category === 'todo' || category === 'doing' || category === 'done') {
            let startX = 0;
            let startY = 0;
            let currentX = 0;
            let isDragging = false;
            let hasMoved = false;
            let isTouch = false;

            // Unified start handler for both touch and pointer events
            const handleStart = (e) => {
                // Don't start drag if clicking on overlay that's already visible
                if (e.target.classList.contains('swipe-overlay') && 
                    e.target.classList.contains('visible')) {
                    return;
                }
                
                // Prevent default to avoid Firefox issues
                if (e.type === 'touchstart' || e.type === 'pointerdown') {
                    isTouch = e.type === 'touchstart' || e.pointerType === 'touch';
                    
                    if (e.type === 'touchstart') {
                        startX = e.touches[0].clientX;
                        startY = e.touches[0].clientY;
                    } else if (e.type === 'pointerdown') {
                        startX = e.clientX;
                        startY = e.clientY;
                        // Capture pointer for consistent tracking
                        card.setPointerCapture(e.pointerId);
                    }
                    
                    currentX = startX;
                    isDragging = true;
                    hasMoved = false;
                }
            };

            // Unified move handler
            const handleMove = (e) => {
                if (!isDragging) return;
                
                if (e.type === 'touchmove') {
                    currentX = e.touches[0].clientX;
                    const currentY = e.touches[0].clientY;
                    const diffX = currentX - startX;
                    const diffY = currentY - startY;

                    // Only process horizontal swipes
                    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
                        hasMoved = true;
                        this.updateSwipeOverlay(card, diffX);
                    }
                } else if (e.type === 'pointermove') {
                    currentX = e.clientX;
                    const currentY = e.clientY;
                    const diffX = currentX - startX;
                    const diffY = currentY - startY;

                    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
                        hasMoved = true;
                        this.updateSwipeOverlay(card, diffX);
                    }
                }
            };

            // Unified end handler
            const handleEnd = (e) => {
                if (!isDragging) return;
                isDragging = false;

                const diffX = currentX - startX;
                const threshold = 50;

                // Remove all overlays
                card.querySelectorAll('.swipe-overlay').forEach(overlay => {
                    overlay.classList.remove('visible');
                });

                if (hasMoved && Math.abs(diffX) > threshold) {
                    let targetCategory = null;
                    
                    if (diffX < 0) {
                        // Swipe left
                        const leftOverlay = card.querySelector('.swipe-overlay.left');
                        targetCategory = leftOverlay ? leftOverlay.dataset.target : null;
                    } else {
                        // Swipe right
                        const rightOverlay = card.querySelector('.swipe-overlay.right');
                        targetCategory = rightOverlay ? rightOverlay.dataset.target : null;
                    }
                    
                    if (targetCategory === 'delete') {
                        this.deletePhoto(photoId, card);
                    } else if (targetCategory) {
                        this.movePhoto(photoId, targetCategory);
                    }
                }
            };

            // Cancel handler
            const handleCancel = (e) => {
                isDragging = false;
                card.querySelectorAll('.swipe-overlay').forEach(overlay => {
                    overlay.classList.remove('visible');
                });
            };

            // Add touch event listeners
            card.addEventListener('touchstart', handleStart, { passive: true });
            card.addEventListener('touchmove', handleMove, { passive: true });
            card.addEventListener('touchend', handleEnd, { passive: true });
            card.addEventListener('touchcancel', handleCancel, { passive: true });

            // Add pointer event listeners for better cross-browser support (including Firefox)
            card.addEventListener('pointerdown', handleStart);
            card.addEventListener('pointermove', handleMove);
            card.addEventListener('pointerup', handleEnd);
            card.addEventListener('pointercancel', handleCancel);
        }
    }

    updateSwipeOverlay(card, diffX) {
        const leftOverlay = card.querySelector('.swipe-overlay.left');
        const rightOverlay = card.querySelector('.swipe-overlay.right');

        if (leftOverlay && rightOverlay) {
            if (diffX < 0) {
                // Swipe left
                leftOverlay.classList.add('visible');
                rightOverlay.classList.remove('visible');
            } else if (diffX > 0) {
                // Swipe right
                rightOverlay.classList.add('visible');
                leftOverlay.classList.remove('visible');
            }
        }
    }

    async movePhoto(photoId, targetCategory) {
        try {
            const response = await fetch('/api/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoId, category: targetCategory })
            });

            const result = await response.json();
            
            if (result.success) {
                this.photos = result.data;
                this.renderPhotos();
                
                const messages = {
                    todo: 'Moved to To Do! 📋',
                    doing: 'Moved to Doing! ⚡',
                    done: 'Moved to Done! ✅'
                };
                this.showToast(messages[targetCategory]);
            }
        } catch (error) {
            console.error('Move error:', error);
            this.showToast('Failed to move photo');
        }
    }

    async deletePhoto(photoId, cardElement) {
        // Add archive animation
        if (cardElement) {
            cardElement.classList.add('archiving');
        }

        try {
            // Wait a bit for animation
            await new Promise(resolve => setTimeout(resolve, 300));
            
            const response = await fetch(`/api/delete/${photoId}`, {
                method: 'DELETE'
            });

            const result = await response.json();
            
            if (result.success) {
                ['todo', 'doing', 'done'].forEach(category => {
                    this.photos[category] = this.photos[category].filter(p => p.id !== photoId);
                });
                
                this.renderPhotos();
                this.showToast('Photo archived! 📦');
            }
        } catch (error) {
            console.error('Archive error:', error);
            this.showToast('Failed to archive photo');
            if (cardElement) {
                cardElement.classList.remove('archiving');
            }
        }
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PhotoKanban();
});
