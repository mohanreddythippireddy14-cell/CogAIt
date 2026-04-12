import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { publishEvent } from '../pubsub/index.js';
import type { AssignmentAnalystOutput } from '../types/index.js';

const app = new Hono();

app.post('/webhook/weak_topics_identified', async (c) => {
  try {
    const input = await c.req.json() as AssignmentAnalystOutput;
    
    // Negotiation Node Logic
    console.log(`[NegotiationNode] Received weak topics for student ${input.student_id}`);
    
    // 1. Current time vs student's configured study window
    const inWindow = input.time_available_for_remediation;
    
    if (inWindow && input.remediation_recommended && input.weak_topics.length > 0) {
      console.log(`[NegotiationNode] Surfacing UI to student: "You showed weakness in ${input.weak_topics.join(', ')}. Want to strengthen them now?"`);
      
      // Simulate student accepting the remediation (In reality, wait for UI response)
      const studentAccepted = true;
      const preference = "pyqs";
      
      if (studentAccepted) {
        console.log(`[NegotiationNode] Student accepted remediation. Triggering Agent 3 (Content)...`);
        await publishEvent('remediation_requested', {
          student_id: input.student_id,
          weak_topics: input.weak_topics,
          remediation_preference: preference,
          time_available_minutes: 30
        });
      } else {
        console.log(`[NegotiationNode] Student declined remediation.`);
        // Emit declined event or log to convex
      }
    } else {
      console.log(`[NegotiationNode] Remediation not surfaced (out of study window or no weak topics).`);
    }

    return c.json({ success: true, status: 'processed' });
  } catch (err: any) {
    console.error('[NegotiationNode] Error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

const port = 8089; // Negotiation Node
console.log(`[negotiation_node] Starting on port ${port}`);
serve({ fetch: app.fetch, port });
export default app;
