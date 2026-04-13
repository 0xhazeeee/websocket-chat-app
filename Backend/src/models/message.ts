import mongoose, { Document, Schema } from "mongoose";

export interface IMessage extends Document {
  roomId: string;
  username: string;
  message: string;
  timestamp: Date;
  readBy: string[];
}

const MessageSchema = new Schema<IMessage>({
  roomId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  readBy: { type: [String], default: [] },
});

export const Message = mongoose.model<IMessage>("Message", MessageSchema);