import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import graphRoutes from './routes/graphRoutes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/context_graph';

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'graph-service' }));

// Graph API routes
app.use('/api/graph', graphRoutes);

// Global error handler
app.use((err, req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => console.log(`Graph Service running on port ${PORT}`));
    })
    .catch((error) => {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    });
