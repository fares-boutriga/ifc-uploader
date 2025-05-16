const fs = require('fs');
const { AuthClientTwoLegged } = require('forge-apis');
const { DerivativesApi } = require('forge-apis');

// Initialize Forge API client
const clientId = 'klJDsxQ1ZCDFrExcY1A4TAJczYSo9rC3fdD49cCVieG9pU3f';
const clientSecret = 'V4ZhM4bQwrUmZYy5aBHpulCOzFZbkiKgJqX4szfGqJtrzyYeUdbFr9pJK69EsVaD';
const authClient = new AuthClientTwoLegged(clientId, clientSecret, ['data:read', 'data:write', 'data:create', 'data:search'], true);

async function extractAFCData(urn) {
  try {
    // Authenticate
    const credentials = await authClient.authenticate();

    // Initialize Derivatives API
    const derivativesApi = new DerivativesApi();
    const metadata = await derivativesApi.getMetadata(urn, {}, authClient, credentials);

    // Extract metadata (names, types, materials)
    const guid = metadata.body.data.metadata[0].guid; // Assuming the first model
    const properties = await derivativesApi.getModelviewProperties(urn, guid, {}, authClient, credentials);

    const elements = properties.body.data.collection.map((item) => ({
      name: item.name,
      type: item.objectid,
      material: item.properties?.Material || 'Unknown',
    }));

    console.log(elements);
    console.log('data', properties.body.data.collection[0]);
  } catch (error) {
    console.error('Error extracting AFC data:', error.message);
  }
}

// Replace with your encoded URN
const urn = 'dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6ZmFyZXMvRmlsZV9pZmMxLmlmYw';
extractAFCData(urn);
