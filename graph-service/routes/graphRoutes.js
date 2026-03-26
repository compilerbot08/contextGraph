import express from 'express';
import Node from '../models/Node.js';
import Edge from '../models/Edge.js';

const router = express.Router();

// ─── GET /api/graph — return full graph (all nodes + edges) ───────────────
router.get('/', async (req, res) => {
    try {
        const typeFilter = req.query.type ? { type: req.query.type } : {};
        const [nodes, edges] = await Promise.all([
            Node.find(typeFilter).lean(),
            Edge.find({}).lean(),
        ]);
        res.json({ nodes, edges, nodeCount: nodes.length, edgeCount: edges.length });
    } catch (err) {
        console.error('GET /graph error:', err);
        res.status(500).json({ error: 'Failed to fetch graph' });
    }
});

// ─── GET /api/graph/nodes — all nodes (optionally filter by type) ─────────
router.get('/nodes', async (req, res) => {
    try {
        const filter = {};
        if (req.query.type) filter.type = req.query.type;
        if (req.query.id) filter.id = req.query.id;
        const limit = parseInt(req.query.limit) || 500;
        const nodes = await Node.find(filter).limit(limit).lean();
        res.json({ nodes, count: nodes.length });
    } catch (err) {
        console.error('GET /nodes error:', err);
        res.status(500).json({ error: 'Failed to fetch nodes' });
    }
});

// ─── GET /api/graph/edges — all edges (optionally filter) ─────────────────
router.get('/edges', async (req, res) => {
    try {
        const filter = {};
        if (req.query.relationship) filter.relationship = req.query.relationship;
        if (req.query.source) filter.source = req.query.source;
        if (req.query.target) filter.target = req.query.target;
        const limit = parseInt(req.query.limit) || 1000;
        const edges = await Edge.find(filter).limit(limit).lean();
        res.json({ edges, count: edges.length });
    } catch (err) {
        console.error('GET /edges error:', err);
        res.status(500).json({ error: 'Failed to fetch edges' });
    }
});

// ─── GET /api/graph/node/:id — single node + connections (edges + neighbors)
router.get('/node/:id', async (req, res) => {
    try {
        const node = await Node.findOne({ id: req.params.id }).lean();
        if (!node) return res.status(404).json({ error: 'Node not found' });

        const edges = await Edge.find({
            $or: [{ source: req.params.id }, { target: req.params.id }],
        }).lean();

        // Collect all connected node IDs and fetch them
        const neighborIds = new Set();
        edges.forEach(e => {
            if (e.source !== req.params.id) neighborIds.add(e.source);
            if (e.target !== req.params.id) neighborIds.add(e.target);
        });
        const connectedNodes = await Node.find({ id: { $in: [...neighborIds] } }).lean();

        res.json({ node, edges, connectedNodes });
    } catch (err) {
        console.error('GET /node/:id error:', err);
        res.status(500).json({ error: 'Failed to fetch node' });
    }
});

// ─── GET /api/graph/neighbors/:id — expand node neighbors ────────────────
router.get('/neighbors/:id', async (req, res) => {
    try {
        const edges = await Edge.find({
            $or: [{ source: req.params.id }, { target: req.params.id }],
        }).lean();
        const neighborIds = new Set();
        edges.forEach(e => {
            if (e.source !== req.params.id) neighborIds.add(e.source);
            if (e.target !== req.params.id) neighborIds.add(e.target);
        });
        const neighbors = await Node.find({ id: { $in: [...neighborIds] } }).lean();
        res.json({ neighbors, edges });
    } catch (err) {
        console.error('GET /neighbors/:id error:', err);
        res.status(500).json({ error: 'Failed to fetch neighbors' });
    }
});

// ─── GET /api/graph/stats — summary counts ────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const [nodeCounts, edgeCounts, totalNodes, totalEdges] = await Promise.all([
            Node.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
            Edge.aggregate([{ $group: { _id: '$relationship', count: { $sum: 1 } } }]),
            Node.countDocuments(),
            Edge.countDocuments(),
        ]);
        res.json({ totalNodes, totalEdges, nodeCounts, edgeCounts });
    } catch (err) {
        console.error('GET /stats error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ─── POST /api/graph/execute-query — run aggregation/find on DB ──────────
router.post('/execute-query', async (req, res) => {
    try {
        const { collection, type, query, pipeline, findQuery } = req.body;

        if (!collection) {
            return res.status(400).json({ error: 'collection is required' });
        }

        const Model = collection === 'edges' ? Edge : Node;
        let results = [];

        // Support both old and new payload structures
        const qType = type || (pipeline ? 'aggregation' : 'find');
        const qBody = query || (qType === 'aggregation' ? { pipeline } : { findQuery });

        if (qType === 'aggregation') {
            const pipe = qBody.pipeline || [];
            results = await Model.aggregate(pipe);
        } else if (qType === 'find' || qType === 'query') {
            const fQuery = qBody.findQuery || qBody;
            const filter = fQuery.filter || {};
            const sort = fQuery.sort || {};
            const limit = parseInt(fQuery.limit) || 100;
            
            results = await Model.find(filter)
                .sort(sort)
                .limit(limit)
                .lean()
                .exec(); // Explicitly use exec() to ensure a promise is returned
        }

        res.json({ results, count: results.length });
    } catch (err) {
        console.error('POST /execute-query error:', err);
        res.status(500).json({ error: 'Query execution failed', details: err.message });
    }
});

// ─── GET /api/graph/traverse/:id — full O2C flow traversal ───────────────
router.get('/traverse/:id', async (req, res) => {
    try {
        const startNode = await Node.findOne({ id: req.params.id }).lean();
        if (!startNode) return res.status(404).json({ error: 'Node not found' });

        const visitedNodes = new Map();
        const visitedEdges = [];
        const queue = [req.params.id];

        visitedNodes.set(req.params.id, startNode);

        while (queue.length > 0) {
            const currentId = queue.shift();
            const edges = await Edge.find({
                $or: [{ source: currentId }, { target: currentId }],
            }).lean();

            for (const edge of edges) {
                const edgeKey = `${edge.source}-${edge.relationship}-${edge.target}`;
                if (!visitedEdges.find(e => `${e.source}-${e.relationship}-${e.target}` === edgeKey)) {
                    visitedEdges.push(edge);
                    const neighborId = edge.source === currentId ? edge.target : edge.source;
                    if (!visitedNodes.has(neighborId)) {
                        const neighbor = await Node.findOne({ id: neighborId }).lean();
                        if (neighbor) {
                            visitedNodes.set(neighborId, neighbor);
                            queue.push(neighborId);
                        }
                    }
                }
            }
        }

        res.json({
            nodes: Array.from(visitedNodes.values()),
            edges: visitedEdges,
        });
    } catch (err) {
        console.error('GET /traverse/:id error:', err);
        res.status(500).json({ error: 'Traversal failed' });
    }
});

export default router;
