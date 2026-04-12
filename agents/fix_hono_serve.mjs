import fs from 'fs';
import path from 'path';

const dirs = [
  'agent1_socratic', 'agent2_analyst', 'agent3_content', 
  'agent4_longterm', 'agent5_ingestion', 'agent6_cohort', 
  'agent7_recommendation', 'agent8_judge', 'watchdog'
];

for (const dir of dirs) {
  const filePath = path.join('src', dir, 'index.ts');
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace('${dir}', dir);
    fs.writeFileSync(filePath, content);
  }
}
console.log('Fixed dir variable reference.');
