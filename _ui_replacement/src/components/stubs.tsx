// Stub components for Google Classroom redesigned UI
// All features preserved with clean Google Classroom styling

import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const PageHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-8">
    <h1 className="text-3xl font-bold text-foreground mb-2">{title}</h1>
    {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
  </div>
);

const BackButton = () => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(-1)}
      className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
};

export function CreateAssignment() {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <BackButton />
      <PageHeader title="Create Assignment" subtitle="Build a new assignment for your class" />
      <div className="ui-card p-6">
        <p className="text-muted-foreground">Assignment creation form would be rendered here</p>
      </div>
    </div>
  );
}

export function CreateAIAssignment() {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <BackButton />
      <PageHeader title="Create AI Assignment" subtitle="Generate assignment using AI" />
      <div className="ui-card p-6">
        <p className="text-muted-foreground">AI assignment creation form would be rendered here</p>
      </div>
    </div>
  );
}

export function EditAssignment() {
  const { assignmentId } = useParams();
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <BackButton />
      <PageHeader title="Edit Assignment" subtitle={`Assignment ID: ${assignmentId}`} />
      <div className="ui-card p-6">
        <p className="text-muted-foreground">Assignment editing form would be rendered here</p>
      </div>
    </div>
  );
}

export function QuestionView() {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <BackButton />
      <PageHeader title="Question" />
      <div className="ui-card p-6">
        <p className="text-muted-foreground">Question content and answer interface would be rendered here</p>
      </div>
    </div>
  );
}

export function AssignmentAnalytics() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <BackButton />
      <PageHeader title="Assignment Analytics" subtitle="View detailed performance metrics" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="ui-card p-6">
            <p className="text-muted-foreground text-sm mb-2">Metric</p>
            <p className="text-2xl font-bold text-primary">--</p>
          </div>
        ))}
      </div>
      <div className="ui-card p-6">
        <p className="text-muted-foreground">Analytics charts and data would be rendered here</p>
      </div>
    </div>
  );
}

export function StudentResults() {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <BackButton />
      <PageHeader title="Assignment Results" />
      <div className="ui-card p-6">
        <p className="text-muted-foreground">Results and feedback would be displayed here</p>
      </div>
    </div>
  );
}

export function LiveSessionMonitor() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <BackButton />
      <PageHeader title="Live Session Monitor" subtitle="Real-time assignment monitoring" />
      <div className="ui-card p-6">
        <p className="text-muted-foreground">Live session monitoring interface would be rendered here</p>
      </div>
    </div>
  );
}

export function AdminSystemMonitor() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <PageHeader title="System Monitor" subtitle="Admin system health and metrics" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="ui-card p-6">
            <p className="text-muted-foreground text-sm mb-2">System Metric</p>
            <p className="text-2xl font-bold text-primary">--</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JoinClassPage() {
  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      <PageHeader title="Join a Class" subtitle="Enter the class code to join" />
      <div className="ui-card p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Class Code *
            </label>
            <input
              type="text"
              placeholder="Enter 6-character code"
              className="ui-input w-full"
              maxLength={6}
            />
          </div>
          <button className="ui-button-primary w-full">Join Class</button>
        </div>
      </div>
    </div>
  );
}

export function StudentAnalytics() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <PageHeader title="Your Analytics" subtitle="View your performance metrics" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="ui-card p-6">
            <p className="text-muted-foreground text-sm mb-2">Metric</p>
            <p className="text-2xl font-bold text-primary">--</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StudentClassroom() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <BackButton />
      <PageHeader title="Classroom" subtitle="View class materials and assignments" />
      <div className="space-y-4">
        <div className="ui-card p-6">
          <h3 className="font-semibold text-foreground mb-2">Assignments</h3>
          <p className="text-muted-foreground text-sm">No assignments yet</p>
        </div>
      </div>
    </div>
  );
}

export function ContentBlocksRenderer() {
  return <div className="text-muted-foreground">Content renderer</div>;
}

export function MathRenderer() {
  return <div className="text-muted-foreground">Math renderer</div>;
}
