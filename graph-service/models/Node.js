import mongoose from 'mongoose';

const nodeSchema = new mongoose.Schema({
    id: { type: String, required: true, index: true },
    type: {
        type: String,
        required: true,
        enum: ['Order', 'Delivery', 'Invoice', 'Payment', 'Customer', 'Product', 'Address'],
        index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

nodeSchema.index({ id: 1, type: 1 }, { unique: true });

const Node = mongoose.model('Node', nodeSchema);
export default Node;
