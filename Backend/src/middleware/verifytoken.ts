import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";


export interface TokenPayLoad {
    userId: string;
    username: string;
}

export function verifyToken(token: string): TokenPayLoad {
    return jwt.verify(token, JWT_SECRET) as TokenPayLoad
}