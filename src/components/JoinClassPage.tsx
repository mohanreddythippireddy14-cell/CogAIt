import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";

export function JoinClassPage() {
  const navigate = useNavigate();
  const anyApi = api as any;
  const joinClassByCode = useMutation(anyApi.classrooms.joinClassByCode);
  const joinedClasses = useQuery(anyApi.classrooms.getStudentClassrooms) as
    | Array<{ _id: string; name: string; joinCode: string; joinedAt: number }>
    | undefined;

  const [code, setCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) {
      toast.error("Enter a classroom code.");
      return;
    }
    setIsJoining(true);
    try {
      const result = await joinClassByCode({ code });
      if (result.joined) {
        toast.success(`Joined ${result.classroomName}`);
      } else {
        toast.message(`Already joined ${result.classroomName}`);
      }
      setCode("");
      navigate("/student/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not join classroom";
      toast.error(message);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-6">
      <button
        type="button"
        onClick={() => navigate("/student/dashboard")}
        className="inline-flex items-center text-muted hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to dashboard
      </button>

      <section className="ui-card p-6">
        <h1 className="text-2xl font-semibold">Join in a class</h1>
        <p className="text-sm text-muted mt-2">
          Paste the unique code shared by your faculty to join the classroom.
        </p>

        <form onSubmit={(e) => void handleJoin(e)} className="mt-5 flex flex-col sm:flex-row gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="flex-1 px-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="Enter class code"
            autoComplete="off"
          />
          <button type="submit" disabled={isJoining} className="ui-button ui-button-primary px-5 py-3 disabled:opacity-50">
            {isJoining ? "Joining..." : "Join class"}
          </button>
        </form>
      </section>

      <section className="ui-card p-6">
        <h2 className="text-lg font-semibold mb-3">Joined Classes</h2>
        {joinedClasses === undefined ? (
          <p className="text-subtle">Loading classes...</p>
        ) : joinedClasses.length === 0 ? (
          <p className="text-subtle">No classes joined yet.</p>
        ) : (
          <div className="grid gap-3">
            {joinedClasses.map((classroom) => (
              <div key={classroom._id} className="ui-card-muted p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{classroom.name}</p>
                  <p className="text-xs text-subtle">Code: {classroom.joinCode}</p>
                </div>
                <Users className="h-5 w-5 text-[var(--color-primary)]" />
              </div>
            ))}
          </div>
        )}
        <p className="text-sm mt-4">
          Need assignments now?{" "}
          <Link to="/student/dashboard" className="text-blue-600 hover:underline">
            Go to dashboard
          </Link>
        </p>
      </section>
    </div>
  );
}


