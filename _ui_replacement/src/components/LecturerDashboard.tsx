import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Edit2 } from "lucide-react";

export function LecturerDashboard() {
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section") || "home";

  const classrooms = useQuery((api as any).classrooms.getLecturerClassrooms) as any;
  const assignments = useQuery((api as any).assignments.getLecturerAssignments) as any;

  if (classrooms === undefined || assignments === undefined) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
        <div className="h-8 bg-muted rounded w-32 ui-skeleton" />
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
      {section === "home" && (
        <>
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Manage your classes and assignments</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="ui-card p-6">
              <p className="text-muted-foreground text-sm mb-2">Classes</p>
              <p className="text-3xl font-bold text-primary">{(classrooms || []).length}</p>
            </div>
            <div className="ui-card p-6">
              <p className="text-muted-foreground text-sm mb-2">Assignments</p>
              <p className="text-3xl font-bold text-primary">{(assignments || []).length}</p>
            </div>
            <div className="ui-card p-6">
              <p className="text-muted-foreground text-sm mb-2">Students</p>
              <p className="text-3xl font-bold text-primary">
                {(classrooms || []).reduce((sum: number, c: any) => sum + (c.studentCount || 0), 0)}
              </p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-foreground mb-4">Classes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {(classrooms || []).map((classroom: any) => (
              <Link
                key={classroom._id}
                to={`/lecturer/dashboard?section=classrooms`}
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
              to="/lecturer/assignment/create"
              className="ui-card p-4 flex items-center justify-center hover:bg-muted transition-colors border-2 border-dashed"
            >
              <div className="text-center">
                <Plus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="font-medium text-foreground">Create Assignment</p>
              </div>
            </Link>
          </div>
        </>
      )}

      {section === "classrooms" && (
        <>
          <h1 className="text-3xl font-bold text-foreground mb-6">Classes</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(classrooms || []).map((classroom: any) => (
              <div key={classroom._id} className="ui-card p-4">
                <div
                  className="h-32 rounded bg-gradient-to-br mb-4"
                  style={{
                    backgroundColor: classroom.color || "#1f73e6",
                  }}
                />
                <h3 className="font-semibold text-foreground text-lg">{classroom.name}</h3>
                <p className="text-sm text-muted-foreground mb-3">{classroom.sectionCode}</p>
                <p className="text-xs text-muted-foreground mb-4">
                  {classroom.studentCount || 0} students
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {section === "assignments" && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-foreground">Assignments</h1>
            <Link to="/lecturer/assignment/create" className="ui-button-primary">
              <Plus className="h-4 w-4 mr-2 inline" />
              New Assignment
            </Link>
          </div>
          <div className="space-y-3">
            {(assignments || []).map((assignment: any) => (
              <div key={assignment._id} className="ui-card p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-foreground text-lg">{assignment.title}</h3>
                    <p className="text-sm text-muted-foreground">{assignment.className}</p>
                  </div>
                  <Link
                    to={`/lecturer/assignment/${assignment._id}/edit`}
                    className="text-primary hover:text-primary/80"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
