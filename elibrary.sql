-- Users table, this arranges all users info into a clear table and separations for easy id
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email_verified TINYINT(1) NOT NULL DEFAULT 0,
    verification_token VARCHAR(255) DEFAULT NULL,
    verification_expires DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Book categories, this were all the books are classified and grouped
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- Books table
CREATE TABLE books (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(100) NOT NULL,
    category_id INT,
    cover_url VARCHAR(255),
    description TEXT,
    status ENUM('available', 'borrowed', 'reserved') DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Borrow records 
CREATE TABLE borrows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    book_id INT NOT NULL,
    borrowed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    returned_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (book_id) REFERENCES books(id)
);

-- sample categories
INSERT INTO categories (name) VALUES ('Fiction') ON DUPLICATE KEY UPDATE name=name;
INSERT INTO categories (name) VALUES ('Science') ON DUPLICATE KEY UPDATE name=name;
INSERT INTO categories (name) VALUES ('History') ON DUPLICATE KEY UPDATE name=name;
INSERT INTO categories (name) VALUES ('Business') ON DUPLICATE KEY UPDATE name=name;
INSERT INTO categories (name) VALUES ('Art') ON DUPLICATE KEY UPDATE name=name;
INSERT INTO categories (name) VALUES ('Health') ON DUPLICATE KEY UPDATE name=name;

-- sample books (use category ids 1..6 or adjust after inspection)
INSERT INTO books (title, author, category_id, cover_url, description, status) VALUES
('The Great Gatsby','F. Scott Fitzgerald', 1, NULL, 'Classic 1920s novel.', 'available'),
('A Brief History of Time','Stephen Hawking', 2, NULL, 'On cosmology and physics.', 'available'),
('Sapiens','Yuval Noah Harari', 3, NULL, 'A brief history of humankind.', 'available'),
('Think and Grow Rich','Napoleon Hill', 4, NULL, 'Self-help classic.', 'available'),
('The Art of War','Sun Tzu', 5, NULL, 'Ancient military treatise.', 'available'),
('Being Mortal','Atul Gawande', 6, NULL, 'On medicine and end-of-life care.', 'available')
ON DUPLICATE KEY UPDATE title=VALUES(title);