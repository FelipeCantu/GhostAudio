import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dbConnect from './db';
import User from '@/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

export async function createUser(username: string, password: string, email?: string) {
    await dbConnect();

    // Check if user exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        throw new Error('User already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
        username,
        password: hashedPassword,
        email,
    });

    return user;
}

export async function verifyUser(username: string, password: string) {
    await dbConnect();

    const user = await User.findOne({ username });
    if (!user) {
        return null;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return null;
    }

    return user;
}

export function generateToken(user: any) {
    return jwt.sign(
        { id: user._id, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

export function verifyToken(token: string) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}
