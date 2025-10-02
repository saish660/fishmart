from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import os
from datetime import datetime
from sqlalchemy import text
from secrets import token_hex
import requests


app = Flask(__name__)
app.secret_key = "REMOVE_ME" #token_hex(32)

# Database configuration: use the instance folder DB if available
os.makedirs(app.instance_path, exist_ok=True)
db_path = os.path.join(app.instance_path, 'fishmart.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Upload configuration
UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB max file size

# Create upload directory if it doesn't exist
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

db = SQLAlchemy(app)

login_manager = LoginManager(app)
login_manager.login_view = "login"

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    user_type = db.Column(db.String(20), nullable=False, default='buyer')  # 'buyer' or 'fisherman'
    
    # Fisherman/Supplier specific fields
    store_name = db.Column(db.String(150), nullable=True)
    store_location = db.Column(db.String(200), nullable=True)
    store_city = db.Column(db.String(100), nullable=True)
    # Precise geolocation and full address (optional)
    store_latitude = db.Column(db.Float, nullable=True)
    store_longitude = db.Column(db.Float, nullable=True)
    store_address = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f'<User {self.email}>'

    @staticmethod
    def get(user_id):
        return User.query.get(int(user_id))

    @staticmethod
    def get_by_email(email):
        return User.query.filter_by(email=email).first()
    
    def is_fisherman(self):
        return self.user_type == 'fisherman'
    
    def get_store_rating(self):
        """Calculate average rating for this store"""
        if not self.is_fisherman():
            return None
        
        reviews = StoreReview.query.filter_by(store_owner_id=self.id).all()
        if not reviews:
            return None
        
        total_rating = sum(review.rating for review in reviews)
        return round(total_rating / len(reviews), 1)
    
    def get_review_count(self):
        """Get total number of reviews for this store"""
        if not self.is_fisherman():
            return 0
        return StoreReview.query.filter_by(store_owner_id=self.id).count()

class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    price = db.Column(db.Float, nullable=False)
    quantity = db.Column(db.Integer, default=1)
    city = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    image_filename = db.Column(db.String(255), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship with User
    user = db.relationship('User', backref=db.backref('products', lazy=True))
    
    def __repr__(self):
        return f'<Product {self.title}>'

class StoreReview(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    store_owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    reviewer_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    rating = db.Column(db.Integer, nullable=False)  # 1-5 rating
    review_text = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    store_owner = db.relationship('User', foreign_keys=[store_owner_id], backref=db.backref('store_reviews', lazy=True))
    reviewer = db.relationship('User', foreign_keys=[reviewer_id], backref=db.backref('given_reviews', lazy=True))
    
    def __repr__(self):
        return f'<StoreReview {self.rating} stars for {self.store_owner.store_name}>'

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@login_manager.user_loader
def load_user(user_id):
    return User.get(user_id)

@app.route("/")
def index():
    # If user is already logged in, redirect to products page
    if current_user.is_authenticated:
        return redirect(url_for("products"))
    return render_template("index.html")

@app.route("/products")
@login_required
def products():
    all_products = Product.query.order_by(Product.created_at.desc()).all()
    return render_template("products.html", products=all_products)

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/contact")
def contact():
    return render_template("contact.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    # If user is already logged in, redirect to products page
    if current_user.is_authenticated:
        return redirect(url_for("products"))
        
    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        
        user = User.get_by_email(email)
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            next_page = request.args.get("next")
            flash("Successfully logged in!", "success")
            return redirect(next_page or url_for("products"))
        else:
            flash("Invalid email or password", "error")
    
    return render_template("login.html")

@app.route("/signup", methods=["GET", "POST"])
def signup():
    # If user is already logged in, redirect to products page
    if current_user.is_authenticated:
        return redirect(url_for("products"))
        
    if request.method == "POST":
        first_name = request.form.get("firstName", "").strip()
        last_name = request.form.get("lastName", "").strip()
        username = f"{first_name} {last_name}".strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirmPassword", "")
        
        if not first_name or not last_name or not email or not password:
            flash("All fields are required", "error")
        elif password != confirm_password:
            flash("Passwords do not match", "error")
        elif len(password) < 8:
            flash("Password must be at least 8 characters long", "error")
        elif User.get_by_email(email):
            flash("An account with this email already exists", "error")
        else:
            password_hash = generate_password_hash(password)
            new_user = User(
                username=username,
                email=email,
                password_hash=password_hash,
                user_type='buyer'
            )
            db.session.add(new_user)
            db.session.commit()
            flash("Account created successfully! Please log in.", "success")
            return redirect(url_for("login"))
    
    return render_template("signup.html")

@app.route("/fisherman-signup", methods=["GET", "POST"])
def fisherman_signup():
    # If user is already logged in, redirect to products page
    if current_user.is_authenticated:
        return redirect(url_for("products"))
        
    if request.method == "POST":
        first_name = request.form.get("firstName", "").strip()
        last_name = request.form.get("lastName", "").strip()
        username = f"{first_name} {last_name}".strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirmPassword", "")
        store_name = request.form.get("storeName", "").strip()
        store_location = request.form.get("storeLocation", "").strip()
        store_city = request.form.get("storeCity", "").strip()
        # Location picker hidden inputs
        lat_raw = request.form.get("latitude")
        lng_raw = request.form.get("longitude")
        addr_full = request.form.get("address", "").strip()
        try:
            store_lat = float(lat_raw) if lat_raw not in (None, "") else None
        except ValueError:
            store_lat = None
        try:
            store_lng = float(lng_raw) if lng_raw not in (None, "") else None
        except ValueError:
            store_lng = None
        # If address provided and store_location empty, use address as store_location (truncate to 200)
        if addr_full and not store_location:
            store_location = addr_full[:200]
        
        if not all([first_name, last_name, email, password, store_name, store_location, store_city]):
            flash("All fields are required", "error")
        elif password != confirm_password:
            flash("Passwords do not match", "error")
        elif len(password) < 8:
            flash("Password must be at least 8 characters long", "error")
        elif User.get_by_email(email):
            flash("An account with this email already exists", "error")
        else:
            password_hash = generate_password_hash(password)
            new_user = User(
                username=username,
                email=email,
                password_hash=password_hash,
                user_type='fisherman',
                store_name=store_name,
                store_location=store_location,
                store_city=store_city,
                store_latitude=store_lat,
                store_longitude=store_lng,
                store_address=addr_full or None
            )
            db.session.add(new_user)
            db.session.commit()
            flash("Fisherman account created successfully! Please log in.", "success")
            return redirect(url_for("login"))
    
    return render_template("fisherman-signup.html")

@app.route("/post-product", methods=["GET", "POST"])
@login_required
def post_product():
    # Check if user is a fisherman
    if not current_user.is_fisherman():
        flash("Only fishermen/suppliers can post products. Please register as a fisherman.", "error")
        return redirect(url_for("index"))
    
    if request.method == "POST":
        title = request.form.get("title", "").strip()
        price = request.form.get("price", "")
        quantity = request.form.get("quantity", "1")
        city = request.form.get("city", "").strip()
        description = request.form.get("description", "").strip()
        
        # Handle file upload
        image_filename = None
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename != '' and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                # Add timestamp to avoid filename conflicts
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_")
                filename = timestamp + filename
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                image_filename = filename
        
        # Validation
        if not title or not price or not city:
            flash("Title, price, and city are required fields", "error")
        else:
            try:
                price_float = float(price)
                quantity_int = int(quantity) if quantity else 1
                
                if price_float <= 0:
                    flash("Price must be greater than 0", "error")
                elif quantity_int <= 0:
                    flash("Quantity must be greater than 0", "error")
                else:
                    # Create new product
                    new_product = Product(
                        title=title,
                        price=price_float,
                        quantity=quantity_int,
                        city=city,
                        description=description,
                        image_filename=image_filename,
                        user_id=current_user.id
                    )
                    db.session.add(new_product)
                    db.session.commit()
                    flash("Product posted successfully!", "success")
                    return redirect(url_for("products"))
            except ValueError:
                flash("Please enter valid numbers for price and quantity", "error")
    
    return render_template("post-product.html")

@app.route("/product/<int:product_id>")
@login_required
def product_detail(product_id):
    product = Product.query.get_or_404(product_id)
    return render_template("product-detail.html", product=product)

@app.route("/store/<int:store_owner_id>")
@login_required
def store_page(store_owner_id):
    store_owner = User.query.get_or_404(store_owner_id)
    
    # Check if user is a fisherman/store owner
    if not store_owner.is_fisherman():
        flash("This user is not a store owner", "error")
        return redirect(url_for("products"))
    
    # Get store products
    store_products = Product.query.filter_by(user_id=store_owner_id).order_by(Product.created_at.desc()).all()
    
    # Get store reviews
    reviews = StoreReview.query.filter_by(store_owner_id=store_owner_id).order_by(StoreReview.created_at.desc()).all()
    
    # Check if current user has already reviewed this store
    existing_review = None
    if current_user.id != store_owner_id:
        existing_review = StoreReview.query.filter_by(
            store_owner_id=store_owner_id, 
            reviewer_id=current_user.id
        ).first()
    
    return render_template("store-page.html", 
                         store_owner=store_owner, 
                         products=store_products, 
                         reviews=reviews, 
                         existing_review=existing_review)

@app.route("/stores")
@login_required
def store_finder():
    """Buyer section: show all stores on a map with cards below."""
    fishermen = User.query.filter_by(user_type='fisherman').all()
    stores = []
    for u in fishermen:
        stores.append({
            'id': u.id,
            'name': u.store_name or u.username,
            'city': u.store_city,
            'location': u.store_location,
            'address': u.store_address,
            'lat': u.store_latitude,
            'lng': u.store_longitude,
            'rating': u.get_store_rating(),
            'reviews': u.get_review_count(),
            'product_count': len(getattr(u, 'products', []) or []),
        })
    return render_template("store-finder.html", stores=stores)

@app.route("/store/<int:store_owner_id>/review", methods=["POST"])
@login_required
def add_store_review(store_owner_id):
    store_owner = User.query.get_or_404(store_owner_id)
    
    # Check if user is trying to review their own store
    if current_user.id == store_owner_id:
        flash("You cannot review your own store", "error")
        return redirect(url_for("store_page", store_owner_id=store_owner_id))
    
    # Check if user already reviewed this store
    existing_review = StoreReview.query.filter_by(
        store_owner_id=store_owner_id, 
        reviewer_id=current_user.id
    ).first()
    
    rating = request.form.get("rating")
    review_text = request.form.get("review_text", "").strip()
    
    if not rating:
        flash("Rating is required", "error")
        return redirect(url_for("store_page", store_owner_id=store_owner_id))
    
    try:
        rating = int(rating)
        if rating < 1 or rating > 5:
            flash("Rating must be between 1 and 5", "error")
            return redirect(url_for("store_page", store_owner_id=store_owner_id))
        
        if existing_review:
            # Update existing review
            existing_review.rating = rating
            existing_review.review_text = review_text
            existing_review.created_at = datetime.utcnow()
            flash("Your review has been updated", "success")
        else:
            # Create new review
            new_review = StoreReview(
                store_owner_id=store_owner_id,
                reviewer_id=current_user.id,
                rating=rating,
                review_text=review_text
            )
            db.session.add(new_review)
            flash("Your review has been added", "success")
        
        db.session.commit()
        
    except ValueError:
        flash("Invalid rating value", "error")
    
    return redirect(url_for("store_page", store_owner_id=store_owner_id))

@app.route("/api/geocode/search")
def geocode_search():
    """Server-side proxy to Nominatim search to avoid CORS in browser."""
    q = request.args.get("q", "").strip()
    limit = request.args.get("limit", "8")
    if not q or len(q) < 2:
        return jsonify([])
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": q,
                "format": "jsonv2",
                "limit": limit,
                "addressdetails": 1,
            },
            headers={
                # Provide a valid UA as required by Nominatim policy
                "User-Agent": "FishmartApp/1.0 (+http://localhost)",
                "Accept": "application/json",
            },
            timeout=10,
        )
        if resp.status_code != 200:
            return jsonify([]), resp.status_code
        return jsonify(resp.json())
    except Exception:
        return jsonify([]), 502

@app.route("/api/geocode/reverse")
def geocode_reverse():
    """Server-side proxy to Nominatim reverse geocode to avoid CORS in browser."""
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    if lat is None or lon is None:
        return jsonify({}), 400
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={
                "format": "jsonv2",
                "lat": lat,
                "lon": lon,
                "zoom": 14,
                "addressdetails": 1,
            },
            headers={
                "User-Agent": "FishmartApp/1.0 (+http://localhost)",
                "Accept": "application/json",
            },
            timeout=10,
        )
        if resp.status_code != 200:
            return jsonify({}), resp.status_code
        return jsonify(resp.json())
    except Exception:
        return jsonify({}), 502

@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("You have been logged out", "info")
    return redirect(url_for("index"))

if __name__ == "__main__":
    with app.app_context():
        db.create_all()  # Creates database tables if they don't exist
        print("Database tables created successfully!")
        # Lightweight migration for new columns if they don't exist (SQLite only)
        try:
            engine = db.engine
            with engine.connect() as con:
                # Check existing columns in User table
                res = con.execute(text("PRAGMA table_info(user)")).fetchall()
                cols = {row[1] for row in res}
                if 'store_latitude' not in cols:
                    con.execute(text("ALTER TABLE user ADD COLUMN store_latitude REAL"))
                    print("Added column: user.store_latitude")
                if 'store_longitude' not in cols:
                    con.execute(text("ALTER TABLE user ADD COLUMN store_longitude REAL"))
                    print("Added column: user.store_longitude")
                if 'store_address' not in cols:
                    con.execute(text("ALTER TABLE user ADD COLUMN store_address TEXT"))
                    print("Added column: user.store_address")
        except Exception as e:
            print("Migration check failed or not applicable:", e)
    app.run(debug=True, host="0.0.0.0", port=5000)