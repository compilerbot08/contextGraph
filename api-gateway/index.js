import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const GRAPH_SERVICE_URL = process.env.GRAPH_SERVICE_URL;
const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL;

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

// Forward graphic requests
app.use('/api/graph', async (req, res) => {
    try {
        const response = await axios({
            method: req.method,
            url: `${GRAPH_SERVICE_URL}/api/graph${req.url}`,
            data: req.body,
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { error: 'Graph Service Error' });
    }
});

// Forward parse-query requests (NL → structured query only)
app.post('/api/parse-query', async (req, res) => {
    try {
        const response = await axios.post(`${LLM_SERVICE_URL}/parse-query`, req.body, { timeout: 30000 });
        res.status(response.status).json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { error: 'LLM Service Error' });
    }
});

// Forward chat requests (full pipeline: NL → query → execute → results)
app.post('/api/chat', async (req, res) => {
    try {
        const response = await axios.post(`${LLM_SERVICE_URL}/chat`, req.body, { timeout: 30000 });
        res.status(response.status).json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json(error.response?.data || { error: 'LLM Service Error' });
    }
});

app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
