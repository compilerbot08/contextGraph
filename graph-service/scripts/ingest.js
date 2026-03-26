/**
 * Dataset Ingestion Script
 * ========================
 * Reads SAP O2C JSONL data and builds a graph in MongoDB.
 *
 * Node types: Order, Delivery, Invoice, Payment, Customer, Product, Address
 * Edge types: ORDER_TO_DELIVERY, DELIVERY_TO_INVOICE, INVOICE_TO_PAYMENT,
 *             CUSTOMER_TO_ORDER, ORDER_TO_PRODUCT, CUSTOMER_TO_ADDRESS
 *
 * Mapping Logic:
 * ───────────────
 * sales_order_headers        → Order nodes
 * outbound_delivery_headers   → Delivery nodes
 * billing_document_headers    → Invoice nodes
 * payments_accounts_receivable → Payment nodes
 * business_partners           → Customer nodes
 * products                    → Product nodes
 * business_partner_addresses  → Address nodes
 *
 * outbound_delivery_items.referenceSdDocument  → Order ── ORDER_TO_DELIVERY ──▶ Delivery
 * billing_document_items.referenceSdDocument   → Delivery ── DELIVERY_TO_INVOICE ──▶ Invoice
 * journal_entry_items.referenceDocument        → Invoice ── INVOICE_TO_PAYMENT ──▶ Payment (via accountingDocument)
 * sales_order_headers.soldToParty              → Customer ── CUSTOMER_TO_ORDER ──▶ Order
 * sales_order_items.material                   → Order ── ORDER_TO_PRODUCT ──▶ Product
 * business_partner_addresses.businessPartner   → Customer ── CUSTOMER_TO_ADDRESS ──▶ Address
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Node from '../models/Node.js';
import Edge from '../models/Edge.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DATASET_PATH = path.resolve(process.cwd(), process.env.DATASET_PATH || '../sap-o2c-data');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/context_graph';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readJsonlDir(dirName) {
    const dirPath = path.join(DATASET_PATH, dirName);
    if (!fs.existsSync(dirPath)) {
        console.warn(`  ⚠  Directory not found: ${dirPath}`);
        return [];
    }
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
    const records = [];
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
        for await (const line of rl) {
            if (line.trim()) records.push(JSON.parse(line));
        }
    }
    console.log(`  ✓  ${dirName}: ${records.length} records`);
    return records;
}

async function bulkUpsertNodes(nodes) {
    if (!nodes.length) return;
    const ops = nodes.map(n => ({
        updateOne: {
            filter: { id: n.id, type: n.type },
            update: { $set: n },
            upsert: true,
        },
    }));
    await Node.bulkWrite(ops, { ordered: false });
}

async function bulkUpsertEdges(edges) {
    if (!edges.length) return;
    const ops = edges.map(e => ({
        updateOne: {
            filter: { source: e.source, target: e.target, relationship: e.relationship },
            update: { $set: e },
            upsert: true,
        },
    }));
    await Edge.bulkWrite(ops, { ordered: false });
}

// ─── Node Builders ────────────────────────────────────────────────────────────

function buildOrderNodes(records) {
    return records.map(r => ({
        id: r.salesOrder,
        type: 'Order',
        metadata: {
            salesOrderType: r.salesOrderType,
            salesOrganization: r.salesOrganization,
            distributionChannel: r.distributionChannel,
            soldToParty: r.soldToParty,
            creationDate: r.creationDate,
            totalNetAmount: parseFloat(r.totalNetAmount) || 0,
            transactionCurrency: r.transactionCurrency,
            overallDeliveryStatus: r.overallDeliveryStatus,
            requestedDeliveryDate: r.requestedDeliveryDate,
            incotermsClassification: r.incotermsClassification,
            incotermsLocation: r.incotermsLocation1,
            customerPaymentTerms: r.customerPaymentTerms,
        },
    }));
}

function buildDeliveryNodes(records) {
    return records.map(r => ({
        id: r.deliveryDocument,
        type: 'Delivery',
        metadata: {
            creationDate: r.creationDate,
            actualGoodsMovementDate: r.actualGoodsMovementDate,
            overallGoodsMovementStatus: r.overallGoodsMovementStatus,
            overallPickingStatus: r.overallPickingStatus,
            shippingPoint: r.shippingPoint,
            deliveryBlockReason: r.deliveryBlockReason,
            incompletionStatus: r.hdrGeneralIncompletionStatus,
        },
    }));
}

function buildInvoiceNodes(records) {
    return records.map(r => ({
        id: r.billingDocument,
        type: 'Invoice',
        metadata: {
            billingDocumentType: r.billingDocumentType,
            creationDate: r.creationDate,
            billingDocumentDate: r.billingDocumentDate,
            totalNetAmount: parseFloat(r.totalNetAmount) || 0,
            transactionCurrency: r.transactionCurrency,
            companyCode: r.companyCode,
            fiscalYear: r.fiscalYear,
            accountingDocument: r.accountingDocument,
            soldToParty: r.soldToParty,
            isCancelled: r.billingDocumentIsCancelled,
        },
    }));
}

function buildPaymentNodes(records) {
    return records.map(r => ({
        id: `${r.accountingDocument}-${r.accountingDocumentItem}`,
        type: 'Payment',
        metadata: {
            companyCode: r.companyCode,
            fiscalYear: r.fiscalYear,
            accountingDocument: r.accountingDocument,
            clearingDate: r.clearingDate,
            clearingAccountingDocument: r.clearingAccountingDocument,
            amountInTransactionCurrency: parseFloat(r.amountInTransactionCurrency) || 0,
            transactionCurrency: r.transactionCurrency,
            customer: r.customer,
            postingDate: r.postingDate,
            glAccount: r.glAccount,
            financialAccountType: r.financialAccountType,
            profitCenter: r.profitCenter,
        },
    }));
}

function buildCustomerNodes(records) {
    return records.map(r => ({
        id: r.businessPartner,
        type: 'Customer',
        metadata: {
            customer: r.customer,
            fullName: r.businessPartnerFullName,
            name: r.businessPartnerName,
            category: r.businessPartnerCategory,
            grouping: r.businessPartnerGrouping,
            creationDate: r.creationDate,
            isBlocked: r.businessPartnerIsBlocked,
            organizationName1: r.organizationBpName1,
            organizationName2: r.organizationBpName2,
        },
    }));
}

function buildProductNodes(records) {
    return records.map(r => ({
        id: r.product,
        type: 'Product',
        metadata: {
            productType: r.productType,
            productOldId: r.productOldId,
            creationDate: r.creationDate,
            grossWeight: parseFloat(r.grossWeight) || 0,
            netWeight: parseFloat(r.netWeight) || 0,
            weightUnit: r.weightUnit,
            productGroup: r.productGroup,
            baseUnit: r.baseUnit,
            division: r.division,
            industrySector: r.industrySector,
            isMarkedForDeletion: r.isMarkedForDeletion,
        },
    }));
}

function buildAddressNodes(records) {
    return records.map(r => ({
        id: r.addressId,
        type: 'Address',
        metadata: {
            businessPartner: r.businessPartner,
            cityName: r.cityName,
            country: r.country,
            postalCode: r.postalCode,
            region: r.region,
            streetName: r.streetName,
            addressTimeZone: r.addressTimeZone,
        },
    }));
}

// ─── Edge Builders ────────────────────────────────────────────────────────────

function buildCustomerToOrderEdges(orderRecords) {
    const edges = [];
    for (const r of orderRecords) {
        if (r.soldToParty) {
            edges.push({
                source: r.soldToParty,
                target: r.salesOrder,
                sourceType: 'Customer',
                targetType: 'Order',
                relationship: 'CUSTOMER_TO_ORDER',
                metadata: {},
            });
        }
    }
    return edges;
}

function buildOrderToProductEdges(orderItemRecords) {
    const seen = new Set();
    const edges = [];
    for (const r of orderItemRecords) {
        if (r.salesOrder && r.material) {
            const key = `${r.salesOrder}|${r.material}`;
            if (!seen.has(key)) {
                seen.add(key);
                edges.push({
                    source: r.salesOrder,
                    target: r.material,
                    sourceType: 'Order',
                    targetType: 'Product',
                    relationship: 'ORDER_TO_PRODUCT',
                    metadata: { netAmount: parseFloat(r.netAmount) || 0, quantity: r.requestedQuantity },
                });
            }
        }
    }
    return edges;
}

function buildOrderToDeliveryEdges(deliveryItemRecords) {
    const seen = new Set();
    const edges = [];
    for (const r of deliveryItemRecords) {
        if (r.referenceSdDocument && r.deliveryDocument) {
            const key = `${r.referenceSdDocument}|${r.deliveryDocument}`;
            if (!seen.has(key)) {
                seen.add(key);
                edges.push({
                    source: r.referenceSdDocument,
                    target: r.deliveryDocument,
                    sourceType: 'Order',
                    targetType: 'Delivery',
                    relationship: 'ORDER_TO_DELIVERY',
                    metadata: {},
                });
            }
        }
    }
    return edges;
}

function buildDeliveryToInvoiceEdges(billingItemRecords) {
    const seen = new Set();
    const edges = [];
    for (const r of billingItemRecords) {
        if (r.referenceSdDocument && r.billingDocument) {
            const key = `${r.referenceSdDocument}|${r.billingDocument}`;
            if (!seen.has(key)) {
                seen.add(key);
                edges.push({
                    source: r.referenceSdDocument,
                    target: r.billingDocument,
                    sourceType: 'Delivery',
                    targetType: 'Invoice',
                    relationship: 'DELIVERY_TO_INVOICE',
                    metadata: {},
                });
            }
        }
    }
    return edges;
}

function buildInvoiceToPaymentEdges(journalEntryRecords, invoiceRecords) {
    // Build a lookup: accountingDocument → billingDocument (invoice)
    const acctDocToInvoice = new Map();
    for (const inv of invoiceRecords) {
        if (inv.accountingDocument) {
            acctDocToInvoice.set(inv.accountingDocument, inv.billingDocument);
        }
    }
    const seen = new Set();
    const edges = [];
    for (const r of journalEntryRecords) {
        // referenceDocument links journal entry to billing document
        const invoiceId = r.referenceDocument || acctDocToInvoice.get(r.accountingDocument);
        if (invoiceId) {
            const paymentId = `${r.accountingDocument}-${r.accountingDocumentItem}`;
            const key = `${invoiceId}|${paymentId}`;
            if (!seen.has(key)) {
                seen.add(key);
                edges.push({
                    source: invoiceId,
                    target: paymentId,
                    sourceType: 'Invoice',
                    targetType: 'Payment',
                    relationship: 'INVOICE_TO_PAYMENT',
                    metadata: {},
                });
            }
        }
    }
    return edges;
}

function buildCustomerToAddressEdges(addressRecords) {
    const edges = [];
    for (const r of addressRecords) {
        if (r.businessPartner && r.addressId) {
            edges.push({
                source: r.businessPartner,
                target: r.addressId,
                sourceType: 'Customer',
                targetType: 'Address',
                relationship: 'CUSTOMER_TO_ADDRESS',
                metadata: {},
            });
        }
    }
    return edges;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function ingest() {
    console.log('═══════════════════════════════════════════════');
    console.log('  Context Graph — Dataset Ingestion');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Dataset path : ${DATASET_PATH}`);
    console.log(`  MongoDB URI  : ${MONGO_URI}`);
    console.log('');

    await mongoose.connect(MONGO_URI);
    console.log('  ✓  Connected to MongoDB\n');

    // Drop existing collections for a clean import
    await Node.deleteMany({});
    await Edge.deleteMany({});
    console.log('  ✓  Cleared existing nodes and edges\n');

    // ── 1. Read raw data ──────────────────────────────────────────────────────
    console.log('  Reading dataset...');
    const orderHeaders       = await readJsonlDir('sales_order_headers');
    const orderItems         = await readJsonlDir('sales_order_items');
    const deliveryHeaders    = await readJsonlDir('outbound_delivery_headers');
    const deliveryItems      = await readJsonlDir('outbound_delivery_items');
    const billingHeaders     = await readJsonlDir('billing_document_headers');
    const billingItems       = await readJsonlDir('billing_document_items');
    const journalEntries     = await readJsonlDir('journal_entry_items_accounts_receivable');
    const payments           = await readJsonlDir('payments_accounts_receivable');
    const businessPartners   = await readJsonlDir('business_partners');
    const products           = await readJsonlDir('products');
    const addresses          = await readJsonlDir('business_partner_addresses');
    console.log('');

    // ── 2. Build & upsert nodes ───────────────────────────────────────────────
    console.log('  Building nodes...');
    const allNodes = [
        ...buildOrderNodes(orderHeaders),
        ...buildDeliveryNodes(deliveryHeaders),
        ...buildInvoiceNodes(billingHeaders),
        ...buildPaymentNodes(payments),
        ...buildCustomerNodes(businessPartners),
        ...buildProductNodes(products),
        ...buildAddressNodes(addresses),
    ];
    console.log(`    Total nodes to upsert: ${allNodes.length}`);
    await bulkUpsertNodes(allNodes);
    console.log('  ✓  Nodes upserted\n');

    // ── 3. Build & upsert edges ───────────────────────────────────────────────
    console.log('  Building edges...');
    const allEdges = [
        ...buildCustomerToOrderEdges(orderHeaders),
        ...buildOrderToProductEdges(orderItems),
        ...buildOrderToDeliveryEdges(deliveryItems),
        ...buildDeliveryToInvoiceEdges(billingItems),
        ...buildInvoiceToPaymentEdges(journalEntries, billingHeaders),
        ...buildCustomerToAddressEdges(addresses),
    ];
    console.log(`    Total edges to upsert: ${allEdges.length}`);
    await bulkUpsertEdges(allEdges);
    console.log('  ✓  Edges upserted\n');

    // ── 4. Summary ────────────────────────────────────────────────────────────
    const nodeCount = await Node.countDocuments();
    const edgeCount = await Edge.countDocuments();
    const nodeCounts = await Node.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]);
    const edgeCounts = await Edge.aggregate([{ $group: { _id: '$relationship', count: { $sum: 1 } } }]);

    console.log('═══════════════════════════════════════════════');
    console.log('  Ingestion Summary');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Total Nodes: ${nodeCount}`);
    for (const nc of nodeCounts) console.log(`    ${nc._id}: ${nc.count}`);
    console.log(`  Total Edges: ${edgeCount}`);
    for (const ec of edgeCounts) console.log(`    ${ec._id}: ${ec.count}`);
    console.log('═══════════════════════════════════════════════');

    await mongoose.disconnect();
    console.log('\n  ✓  Done.\n');
}

ingest().catch(err => {
    console.error('Ingestion failed:', err);
    process.exit(1);
});
