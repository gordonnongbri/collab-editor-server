import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/collab-editor';
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

const snapshotSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  snapshot: { type: Buffer, required: true },
  updatedAt: { type: Date, default: Date.now },
});

const updateSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  update: { type: Buffer, required: true },
  ts: { type: Date, default: Date.now, index: true },
});

export const Snapshot = mongoose.model('Snapshot', snapshotSchema);
export const Update = mongoose.model('Update', updateSchema);