#!/usr/bin/env python3
"""
Database management script for Amcho Pasro Flask app
Usage: python db_manager.py [command]

Commands:
  list_users    - List all users in the database
  create_user   - Create a new user (interactive)
  delete_user   - Delete a user by email
  reset_db      - Delete all data and recreate tables
"""

import sys
import os

# Add current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from werkzeug.security import generate_password_hash

# Import Flask app components
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin

# Recreate app context for database operations
app = Flask(__name__)
# Use instance folder DB like the app
os.makedirs(app.instance_path, exist_ok=True)
db_path = os.path.join(app.instance_path, 'amcho_pasro.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)

    def __repr__(self):
        return f'<User {self.email}>'

    @staticmethod
    def get(user_id):
        return User.query.get(int(user_id))

    @staticmethod
    def get_by_email(email):
        return User.query.filter_by(email=email).first()

def list_users():
    """List all users in the database"""
    with app.app_context():
        users = User.query.all()
        if not users:
            print("No users found in database.")
            return
        
        print(f"\n{'ID':<5} {'Username':<20} {'Email':<30}")
        print("-" * 55)
        for user in users:
            print(f"{user.id:<5} {user.username:<20} {user.email:<30}")
        print(f"\nTotal users: {len(users)}")

def create_user():
    """Create a new user interactively"""
    with app.app_context():
        print("\n--- Create New User ---")
        username = input("Username: ").strip()
        email = input("Email: ").strip()
        password = input("Password: ").strip()
        
        if not username or not email or not password:
            print("Error: All fields are required!")
            return
        
        # Check if user already exists
        if User.get_by_email(email):
            print(f"Error: User with email '{email}' already exists!")
            return
        
        # Create new user
        password_hash = generate_password_hash(password)
        new_user = User(
            username=username,
            email=email,
            password_hash=password_hash
        )
        
        db.session.add(new_user)
        db.session.commit()
        print(f"Success: User '{username}' created with email '{email}'")

def delete_user():
    """Delete a user by email"""
    with app.app_context():
        email = input("Enter email of user to delete: ").strip()
        user = User.get_by_email(email)
        
        if not user:
            print(f"Error: No user found with email '{email}'")
            return
        
        confirm = input(f"Are you sure you want to delete user '{user.username}' ({email})? [y/N]: ")
        if confirm.lower() != 'y':
            print("Deletion cancelled.")
            return
        
        db.session.delete(user)
        db.session.commit()
        print(f"Success: User '{user.username}' deleted.")

def reset_db():
    """Delete all data and recreate tables"""
    with app.app_context():
        confirm = input("This will DELETE ALL DATA. Are you sure? [y/N]: ")
        if confirm.lower() != 'y':
            print("Reset cancelled.")
            return
        
        db.drop_all()
        db.create_all()
        print("Success: Database reset. All tables recreated.")

def show_help():
    """Show help message"""
    print(__doc__)

def main():
    if len(sys.argv) < 2:
        show_help()
        return
    
    command = sys.argv[1].lower()
    
    commands = {
        'list_users': list_users,
        'create_user': create_user,
        'delete_user': delete_user,
        'reset_db': reset_db,
        'help': show_help
    }
    
    if command in commands:
        commands[command]()
    else:
        print(f"Unknown command: {command}")
        show_help()

if __name__ == "__main__":
    main()
