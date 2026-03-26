import mongoose from 'mongoose';

const edgeSchema = new mongoose.Schema({
    source: { type: String, required: true, index: true },
    target: { type: String, required: true, index: true },
    sourceType: {
        type: String,
        required: true,
        enum: ['Order', 'Delivery', 'Invoice', 'Payment', 'Customer', 'Product', 'Address'],
    },
    targetType: {
        type: String,
        required: true,
        enum: ['Order', 'Delivery', 'Invoice', 'Payment', 'Customer', 'Product', 'Address'],
    },
    relationship: {
        type: String,
        required: true,
        enum: [
            'ORDER_TO_DELIVERY',
            'DELIVERY_TO_INVOICE',
            'INVOICE_TO_PAYMENT',
            'CUSTOMER_TO_ORDER',
            'ORDER_TO_PRODUCT',
            'CUSTOMER_TO_ADDRESS',
        ],
        index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

edgeSchema.index({ source: 1, target: 1, relationship: 1 }, { unique: true });

const Edge = mongoose.model('Edge', edgeSchema);
export default Edge;
