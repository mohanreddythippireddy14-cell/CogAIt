// Mocked Vertex AI Search tool to return realistic PYQ JSON
// Replaces real NTA/ALLEN datastores until later phases.

export const mockVertexSearch = async (topics: string[], domain: string) => {
  console.log(`[Vertex Mock] Searching ${domain} for topics: ${topics.join(',')}`);
  
  return [
    {
      source: `mock_${domain}_database`,
      confidence: 0.95,
      content: "Previous year question from 2022 JEE Advanced regarding this specific topic..."
    }
  ];
};
