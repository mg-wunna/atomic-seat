import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/template";

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  process.stderr.write("[seed] Connected. Add seed logic here.\n");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
