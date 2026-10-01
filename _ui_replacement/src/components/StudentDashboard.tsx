import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

export function StudentDashboard() {
  const classrooms = useQuery((api as any).classrooms.getStudentClassrooms) as any;
  const assignments = useQuery((api as any).assignments.getStudentAssignments) as any;

  if (classrooms === undefined || assignments === undefined) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
        <div className="space-y-2">
          <div className="h-8 bg-muted rounded w-32 ui-skeleton" />
          <div className="h-4 bg-muted rounded w-48 ui-skeleton" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 bg-card rounded-lg ui-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Classes</h1>
        <p className="text-muted-foreground">Your enrolled classrooms and courses</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
        {(classrooms || []).map((classroom: any) => (
          <Link
            key={classroom._id}
            to={`/student/classroom/${classroom._id}`}
            className="ui-card p-4 hover:shadow-md transition-shadow"
          >
            <div
              className="h-24 rounded bg-gradient-to-br mb-4"
              style={{
                backgroundColor: classroom.color || "#1f73e6",
              }}
            />
            <h3 className="font-semibold text-foreground text-lg">{classroom.name}</h3>
            <p className="text-sm text-muted-foreground">{classroom.sectionCode}</p>
          </Link>
        ))}
        <Link
          to="/student/join-class"
          className="ui-card p-4 flex items-center justify-center hover:bg-muted transition-colors border-2 border-dashed"
        >
          <div className="text-center">
            <Plus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="font-medium text-foreground">Join Class</p>
          </div>
        </Link>
      </div>

      <div>
        <h2 className="text-xl font-bold text-foreground mb-4">Assignments</h2>
        <div className="space-y-3">
          {(assignments || []).slice(0, 5).map((assignment: any) => (
            <Link
              key={assignment._id}
              to={`/student/assignment/${assignment._id}`}
              className="ui-card p-4 hover:shadow-md transition-shadow flex justify-between items-center"
            >
              <div>
                <h3 className="font-semibold text-foreground">{assignment.title}</h3>
                <p className="text-sm text-muted-foreground">{assignment.className}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-primary">View</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
