import mongoose, { Schema } from "mongoose";

export interface IUserSnapshot {
  _id: string;
  name: string;
  email: string;
}

const UserSnapshotSchema = new Schema<IUserSnapshot>({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
});

export const UserSnapshot = mongoose.model<IUserSnapshot>("UserSnapshot", UserSnapshotSchema);
