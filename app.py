from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import json
import uuid
import shutil
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Data file to store photo states
DATA_FILE = 'photos_data.json'

# Category directories
CATEGORIES = ['todo', 'doing', 'done', 'archived']

# Ensure upload folders exist
for category in CATEGORIES:
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], category), exist_ok=True)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def load_photos():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    return {'todo': [], 'doing': [], 'done': []}

def save_photos(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def move_photo_file(filename, from_category, to_category):
    """Move photo file from one category directory to another"""
    source_path = os.path.join(app.config['UPLOAD_FOLDER'], from_category, filename)
    dest_path = os.path.join(app.config['UPLOAD_FOLDER'], to_category, filename)
    
    if os.path.exists(source_path):
        shutil.move(source_path, dest_path)
        return True
    return False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/photos')
def get_photos():
    return jsonify(load_photos())

@app.route('/api/upload', methods=['POST'])
def upload_photo():
    if 'photos' not in request.files:
        return jsonify({'error': 'No photos provided'}), 400
    
    files = request.files.getlist('photos')
    
    if not files or len(files) == 0:
        return jsonify({'error': 'No photos selected'}), 400
    
    # Load current data
    data = load_photos()
    uploaded_photos = []
    
    for file in files:
        if file and file.filename != '' and allowed_file(file.filename):
            # Generate unique filename
            ext = secure_filename(file.filename).rsplit('.', 1)[1].lower()
            filename = f"{uuid.uuid4().hex}.{ext}"
            
            # Save to todo directory
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'todo', filename)
            file.save(filepath)
            
            # Create photo object
            photo = {
                'id': uuid.uuid4().hex,
                'filename': filename,
                'url': f'/static/uploads/todo/{filename}',
                'category': 'todo',
                'uploaded_at': datetime.utcnow().isoformat()
            }
            
            uploaded_photos.append(photo)
    
    if not uploaded_photos:
        return jsonify({'error': 'No valid photos uploaded'}), 400
    
    # Add all photos to todo category at the beginning (reverse to maintain order)
    for photo in reversed(uploaded_photos):
        data['todo'].insert(0, photo)
    
    # Save data
    save_photos(data)
    
    return jsonify({'success': True, 'photos': uploaded_photos, 'count': len(uploaded_photos)})

@app.route('/api/move', methods=['POST'])
def move_photo():
    data_request = request.json
    photo_id = data_request.get('photoId')
    target_category = data_request.get('category')
    
    if not photo_id or target_category not in ['todo', 'doing', 'done']:
        return jsonify({'error': 'Invalid request'}), 400
    
    # Load current data
    data = load_photos()
    
    # Find and remove photo from current category
    photo = None
    source_category = None
    for category in ['todo', 'doing', 'done']:
        for p in data[category]:
            if p['id'] == photo_id:
                photo = p
                source_category = category
                data[category].remove(p)
                break
        if photo:
            break
    
    if not photo:
        return jsonify({'error': 'Photo not found'}), 404
    
    # Move the actual file
    current_category = photo.get('category', source_category)
    if move_photo_file(photo['filename'], current_category, target_category):
        # Update photo metadata
        photo['category'] = target_category
        photo['url'] = f'/static/uploads/{target_category}/{photo["filename"]}'
        photo['moved_at'] = datetime.utcnow().isoformat()
    
    # Add to target category
    data[target_category].append(photo)
    
    # Save data
    save_photos(data)
    
    return jsonify({'success': True, 'data': data})

@app.route('/api/delete/<photo_id>', methods=['DELETE'])
def delete_photo(photo_id):
    # Load current data
    data = load_photos()
    
    # Find and remove photo
    photo = None
    source_category = None
    for category in ['todo', 'doing', 'done']:
        for p in data[category]:
            if p['id'] == photo_id:
                photo = p
                source_category = category
                data[category].remove(p)
                break
        if photo:
            break
    
    if not photo:
        return jsonify({'error': 'Photo not found'}), 404
    
    # Move file to archived directory instead of deleting
    current_category = photo.get('category', source_category)
    if move_photo_file(photo['filename'], current_category, 'archived'):
        photo['category'] = 'archived'
        photo['url'] = f'/static/uploads/archived/{photo["filename"]}'
        photo['archived_at'] = datetime.utcnow().isoformat()
    
    # Save data
    save_photos(data)
    
    return jsonify({'success': True, 'message': 'Photo archived'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
