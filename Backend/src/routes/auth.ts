import {Router, Request, Response} from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../models/user";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

//new user registration
router.post("/register", async (req:Request, res: Response) => {
    const { username, password } = req.body;

    if(!username || !password) {
        res.status(400).json({error: "Username and password are required"})
        return;
    }

    const existing = await User.findOne({ username });
    if (existing) {
        res.status(400).json({error: "username already taken"});
        return;
    }

    const hashed = await bcrypt.hash(password, 10);
    await User.create({ username, password: hashed });

    res.json({ message: "Registered Successfully"});
});

//get a token and login
router.post("/login", async (req: Request, res: Response) => {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if(!user) {
        res.status(401).json({ error: "Invalid username or password "});
        return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if(!valid) {
        res.status(401).json({error: "Invalid username or password"});
        return;
    }

    const token = jwt.sign(
        { userId: user._id.toString(), username: user.username},
        JWT_SECRET, 
        { expiresIn: "7d"}
    );


    res.json({ token, username: user.username });
});

export default router;

