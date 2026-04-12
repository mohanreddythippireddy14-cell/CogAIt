import fs from 'fs';
import path from 'path';

const dirs = [
  'agent1_socratic', 'agent2_analyst', 'agent3_content', 
  'agent4_longterm', 'agent5_ingestion', 'agent6_cohort', 
  'agent7_recommendation', 'agent8_judge', 'watchdog'
];

dirs.forEach((dir) => {
  const filePath = path.join('src', dir, 'index.ts');
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/result\.text\(\)/g, "result.text");
    fs.writeFileSync(filePath, content);
  }
});

const agent3Path = path.join('src', 'agent3_content', 'index.ts');
if (fs.existsSync(agent3Path)) {
  let content = fs.readFileSync(agent3Path, 'utf8');
  content = content.replace("import { vectorSearchMock }", "import { mockVertexSearch as vectorSearchMock }");
  fs.writeFileSync(agent3Path, content);
}

