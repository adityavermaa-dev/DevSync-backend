const mongoose = require("mongoose");

const connectionRequestSchema = new mongoose.Schema({
    fromUserId : {
        type : mongoose.Schema.ObjectId,
        required : true,
        ref : "User"
    },
    toUserId : {
        type : mongoose.Schema.ObjectId,
        required : true,
        ref : "User"
    },
    status : {
        type : String,
        enum : {
            values : ["interested", "ignored", "accepted", "rejected"],
            message : `{VALUE} is not valid`
        }
    }
},{timestamps : true})

connectionRequestSchema.index({ fromUserId: 1 });
connectionRequestSchema.index({ toUserId: 1 });
connectionRequestSchema.index({ status: 1 });

connectionRequestSchema.pre("save",function(next){
    const connectionRequest = this;
    if(connectionRequest.fromUserId.equals(connectionRequest.toUserId)){
        throw new Error("Cannot send request to yourself")
    }
    next();
})

const ConnectionRequest = mongoose.model("ConnectionRequest",connectionRequestSchema);

module.exports = ConnectionRequest;