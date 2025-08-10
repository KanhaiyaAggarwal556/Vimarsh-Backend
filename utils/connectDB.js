import mongoose from "mongoose";

const connectDb = async ()=>{
    try {
        console.log("MongoDB in Starting ");
        await mongoose.connect(process.env.MONGO_URL);
        console.log("MongoDB is connected");
    } catch (err) {
        console.log("Mongo Server Error", err)
        
    }
}
export default connectDb;