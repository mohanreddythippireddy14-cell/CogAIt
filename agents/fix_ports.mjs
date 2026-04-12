import fs from 'fs';
import path from 'path';

const dirs = [
  'agent1_socratic', 'agent2_analyst', 'agent3_content', 
  'agent4_longterm', 'agent5_ingestion', 'agent6_cohort', 
  'agent7_recommendation', 'agent8_judge', 'watchdog'
];

dirs.forEach((dir, i) => {
  const filePath = path.join('src', dir, 'index.ts');
  if (fs.existsSync(filePath)) {
    const port = 8081 + i;
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/8080/g, port.toString());
    fs.writeFileSync(filePath, content);
  }
});
