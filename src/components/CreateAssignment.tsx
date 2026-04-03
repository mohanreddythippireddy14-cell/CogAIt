import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Plus, Trash2, GripVertical } from "lucide-react";

type Subject = "Physics" | "Chemistry" | "Math";
type AssignmentDifficulty = "easy" | "medium" | "hard" | "mixed";
type Difficulty = "easy" | "medium" | "hard";

interface Question {
  id: string;
  questionText: string;
  subject: Subject;
  topic: string;
  difficulty: Difficulty;
  givenVariables?: string;
  correctAnswer?: string;
  imageFile?: File;
}

export function CreateAssignment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const classroomIdFromQuery = searchParams.get("classroomId") ?? "";
  const lockClassroom = classroomIdFromQuery.length > 0;
  const anyApi = api as any;
  const createAssignment = useMutation(anyApi.assignments.createAssignment);
  const addQuestion = useMutation(api.assignments.addQuestion);
  const publishAssignment = useMutation(api.assignments.publishAssignment);
  const classrooms = useQuery(anyApi.classrooms.getFacultyClassrooms) as
    | Array<{ _id: string; name: string; joinCode: string }>
    | undefined;
  
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [assignmentId, setAssignmentId] = useState<Id<"assignments"> | null>(null);
  
  // Step 1 - Basic Info
  const [basicInfo, setBasicInfo] = useState({
    title: "",
    description: "",
    subject: "Physics" as const,
    chapter: "",
    difficulty: "mixed" as AssignmentDifficulty,
    dueDate: "",
    instructions: "",
    timeLimitMinutes: 90,
    minReasoningChars: 30,
    allowedLevels: [1, 2, 3, 4],
    classroomId: classroomIdFromQuery,
  });
  
  // Step 2 - Questions
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: "1",
      questionText: "",
      subject: "Physics",
      topic: "",
      difficulty: "medium",
      givenVariables: "",
      correctAnswer: "",
    }
  ]);

  const handleStep1Submit = async () => {
    if (!basicInfo.title.trim()) {
      toast.error("Assignment title is required");
      return;
    }
    
    if (basicInfo.allowedLevels.length === 0) {
      toast.error("At least one AI level must be allowed");
      return;
    }
    if (!basicInfo.classroomId) {
      toast.error("Please select a classroom");
      return;
    }

    try {
      setIsLoading(true);
      const id = await createAssignment({
        title: basicInfo.title.trim() || "Untitled Assignment",
        subject: basicInfo.subject,
        chapter: basicInfo.chapter || undefined,
        difficulty: basicInfo.difficulty,
        description: basicInfo.description || undefined,
        dueDate: basicInfo.dueDate ? new Date(basicInfo.dueDate).getTime() : undefined,
        instructions: basicInfo.instructions || undefined,
        timeLimitMinutes: basicInfo.timeLimitMinutes,
        minReasoningChars: basicInfo.minReasoningChars,
        allowedLevels: basicInfo.allowedLevels,
        classroomId: basicInfo.classroomId || undefined,
      });
      setAssignmentId(id);
      setCurrentStep(2);
      toast.success("Assignment created! Now add questions.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create assignment";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const addNewQuestion = () => {
    if (questions.length >= 30) {
      toast.error("Maximum 30 questions allowed");
      return;
    }
    
    const newQuestion: Question = {
      id: Date.now().toString(),
      questionText: "",
      subject: basicInfo.subject,
      topic: "",
      difficulty: "medium",
      givenVariables: "",
      correctAnswer: "",
    };
    
    setQuestions([...questions, newQuestion]);
  };

  const removeQuestion = (id: string) => {
    if (questions.length <= 1) {
      toast.error("At least one question is required");
      return;
    }
    setQuestions(questions.filter(q => q.id !== id));
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const handleStep2Submit = async () => {
    const validQuestions = questions.filter(q => q.questionText.trim() && q.topic.trim());
    
    if (validQuestions.length === 0) {
      toast.error("At least one complete question is required");
      return;
    }

    try {
      setIsLoading(true);
      
      // Add all questions to the assignment
      for (let i = 0; i < validQuestions.length; i++) {
        const question = validQuestions[i];
        await addQuestion({
          assignmentId: assignmentId!,
          questionNumber: i + 1,
          questionText: question.questionText,
          subject: question.subject,
          topic: question.topic,
          difficulty: question.difficulty,
          givenVariables: question.givenVariables || undefined,
          correctAnswer: question.correctAnswer || undefined,
        });
      }
      
      setCurrentStep(3);
      toast.success(`${validQuestions.length} questions added successfully!`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add questions";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async () => {
    try {
      setIsLoading(true);
      await publishAssignment({ assignmentId: assignmentId! });
      toast.success("Assignment published successfully!");
      navigate("/lecturer/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish assignment";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <button
          onClick={() => navigate("/lecturer/dashboard")}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </button>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Assignment</h1>
        
        {/* Progress Steps */}
        <div className="flex items-center space-x-4 mb-8">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                currentStep >= step ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-600"
              }`}>
                {step}
              </div>
              <span className={`ml-2 text-sm ${currentStep >= step ? "text-blue-600" : "text-gray-500"}`}>
                {step === 1 ? "Basic Info" : step === 2 ? "Add Questions" : "Review & Publish"}
              </span>
              {step < 3 && <ArrowRight className="h-4 w-4 text-gray-400 ml-4" />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1 - Basic Info */}
      {currentStep === 1 && (
        <div className="ui-card p-6">
          <h2 className="text-xl font-semibold mb-6">Assignment Details</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assignment Title *
              </label>
              <input
                type="text"
                required
                className="auth-input-field"
                value={basicInfo.title}
                onChange={(e) => setBasicInfo(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Physics Mock Test - Mechanics"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (Optional)
              </label>
              <textarea
                className="auth-input-field"
                rows={3}
                value={basicInfo.description}
                onChange={(e) => setBasicInfo(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the assignment..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Chapter</label>
              <input
                type="text"
                className="auth-input-field"
                value={basicInfo.chapter}
                onChange={(e) => setBasicInfo(prev => ({ ...prev, chapter: e.target.value }))}
                placeholder="e.g., Projectile Motion"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Primary Subject
                </label>
                <select
                  className="auth-input-field"
                  value={basicInfo.subject}
                  onChange={(e) => setBasicInfo(prev => ({ ...prev, subject: e.target.value as Subject }))}
                >
                  <option value="Physics">Physics</option>
                  <option value="Chemistry">Chemistry</option>
                  <option value="Math">Mathematics</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Difficulty
                </label>
                <select
                  className="auth-input-field"
                  value={basicInfo.difficulty}
                  onChange={(e) => setBasicInfo(prev => ({ ...prev, difficulty: e.target.value as AssignmentDifficulty }))}
                >
                  <option value="mixed">Mixed</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Limit (Minutes)
                </label>
                <input
                  type="number"
                  min="30"
                  max="180"
                  className="auth-input-field"
                  value={basicInfo.timeLimitMinutes}
                  onChange={(e) => setBasicInfo(prev => ({ ...prev, timeLimitMinutes: parseInt(e.target.value) }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Reasoning Characters
                </label>
                <input
                  type="number"
                  min="0"
                  max="300"
                  className="auth-input-field"
                  value={basicInfo.minReasoningChars}
                  onChange={(e) => setBasicInfo(prev => ({ ...prev, minReasoningChars: Math.max(0, parseInt(e.target.value || "0", 10)) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Due Date (Optional)</label>
                <input
                  type="date"
                  className="auth-input-field"
                  value={basicInfo.dueDate}
                  onChange={(e) => setBasicInfo(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Instructions (Optional)</label>
                <input
                  type="text"
                  className="auth-input-field"
                  value={basicInfo.instructions}
                  onChange={(e) => setBasicInfo(prev => ({ ...prev, instructions: e.target.value }))}
                  placeholder="Shown before assignment start"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Classroom (Optional)
              </label>
              <select
                className="auth-input-field"
                value={basicInfo.classroomId}
                onChange={(e) => setBasicInfo(prev => ({ ...prev, classroomId: e.target.value }))}
                disabled={lockClassroom}
              >
                <option value="">Select classroom</option>
                {(classrooms ?? []).map((classroom) => (
                  <option key={classroom._id} value={classroom._id}>
                    {classroom.name} ({classroom.joinCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Allowed AI Help Levels *
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { level: 1, name: "Audit Mode", desc: "Logic verification only" },
                  { level: 2, name: "Socratic Mode", desc: "Guiding questions" },
                  { level: 3, name: "Instruction Mode", desc: "Approach & formulas" },
                  { level: 4, name: "Deep Assistance", desc: "Step-by-step guidance" },
                ].map(({ level, name, desc }) => (
                  <label key={level} className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={basicInfo.allowedLevels.includes(level)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBasicInfo(prev => ({ ...prev, allowedLevels: [...prev.allowedLevels, level] }));
                        } else {
                          setBasicInfo(prev => ({ ...prev, allowedLevels: prev.allowedLevels.filter(l => l !== level) }));
                        }
                      }}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium text-sm">{name}</p>
                      <p className="text-xs text-gray-600">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setBasicInfo((prev) => ({ ...prev, allowedLevels: [1, 2] }))}
                  className="px-3 py-1 rounded bg-red-100 text-red-700 text-xs"
                >
                  Strict (1-2)
                </button>
                <button
                  type="button"
                  onClick={() => setBasicInfo((prev) => ({ ...prev, allowedLevels: [1, 2, 3] }))}
                  className="px-3 py-1 rounded bg-amber-100 text-amber-700 text-xs"
                >
                  Balanced (1-3)
                </button>
                <button
                  type="button"
                  onClick={() => setBasicInfo((prev) => ({ ...prev, allowedLevels: [1, 2, 3, 4] }))}
                  className="px-3 py-1 rounded bg-green-100 text-green-700 text-xs"
                >
                  All Levels
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-8">
            <button
              onClick={handleStep1Submit}
              disabled={isLoading}
              className="ui-button ui-button-primary px-6 py-3 disabled:opacity-50"
            >
              {isLoading ? "Creating..." : "Next: Add Questions"}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 - Add Questions */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Add Questions ({questions.length}/30)</h2>
            <button
              onClick={addNewQuestion}
              className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Question
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((question, index) => (
              <QuestionEditor
                key={question.id}
                question={question}
                index={index}
                onUpdate={(updates) => updateQuestion(question.id, updates)}
                onRemove={() => removeQuestion(question.id)}
                canRemove={questions.length > 1}
              />
            ))}
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep(1)}
              className="ui-button ui-button-secondary px-6 py-3"
            >
              Previous
            </button>
            
            <button
              onClick={handleStep2Submit}
              disabled={isLoading}
              className="ui-button ui-button-primary px-6 py-3 disabled:opacity-50"
            >
              {isLoading ? "Adding Questions..." : "Next: Review"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 - Review & Publish */}
      {currentStep === 3 && (
        <div className="ui-card p-6">
          <h2 className="text-xl font-semibold mb-6">Review & Publish</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Assignment Summary</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p><strong>Title:</strong> {basicInfo.title}</p>
                <p><strong>Questions:</strong> {questions.filter(q => q.questionText.trim()).length}</p>
                <p><strong>Time Limit:</strong> {basicInfo.timeLimitMinutes} minutes</p>
                <p><strong>Allowed AI Levels:</strong> {basicInfo.allowedLevels.join(", ")}</p>
                <p>
                  <strong>Classroom:</strong>{" "}
                  {(classrooms ?? []).find((c) => c._id === basicInfo.classroomId)?.name ?? "Not selected"}
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 mb-2">Questions Preview</h3>
              <div className="space-y-3">
                {questions.filter(q => q.questionText.trim()).map((question, index) => (
                  <div key={question.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">Question {index + 1}</p>
                        <p className="text-gray-700 mt-1">{question.questionText}</p>
                        <div className="flex gap-4 mt-2 text-sm text-gray-600">
                          <span>Topic: {question.topic}</span>
                          <span>Difficulty: {question.difficulty}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setCurrentStep(2)}
                        className="text-blue-500 hover:text-blue-700 text-sm"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-8">
            <button
              onClick={() => setCurrentStep(2)}
              className="ui-button ui-button-secondary px-6 py-3"
            >
              Previous
            </button>
            
            <button
              onClick={handlePublish}
              disabled={isLoading}
              className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
            >
              {isLoading ? "Publishing..." : "Publish Assignment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionEditor({ 
  question, 
  index, 
  onUpdate, 
  onRemove, 
  canRemove 
}: {
  question: Question;
  index: number;
  onUpdate: (updates: Partial<Question>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="ui-card p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <GripVertical className="h-5 w-5 text-gray-400" />
          <h3 className="font-medium">Question {index + 1}</h3>
        </div>
        
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-red-500 hover:text-red-700 p-1"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Question Text *
          </label>
          <textarea
            required
            className="auth-input-field"
            rows={4}
            value={question.questionText}
            onChange={(e) => onUpdate({ questionText: e.target.value })}
            placeholder="Enter the complete question..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject
            </label>
            <select
              className="auth-input-field"
              value={question.subject}
              onChange={(e) => onUpdate({ subject: e.target.value as Subject })}
            >
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
              <option value="Math">Mathematics</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Topic *
            </label>
            <input
              type="text"
              required
              className="auth-input-field"
              value={question.topic}
              onChange={(e) => onUpdate({ topic: e.target.value })}
              placeholder="e.g., Kinematics, Thermodynamics"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Difficulty
            </label>
            <select
              className="auth-input-field"
              value={question.difficulty}
              onChange={(e) => onUpdate({ difficulty: e.target.value as Difficulty })}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Given Variables (Optional)
            </label>
            <textarea
              className="auth-input-field"
              rows={3}
              value={question.givenVariables}
              onChange={(e) => onUpdate({ givenVariables: e.target.value })}
              placeholder="e.g., h = 50m, vâ‚€ = 20 m/s, Î¸ = 30Â°"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Correct Answer (Optional)
            </label>
            <textarea
              className="auth-input-field"
              rows={3}
              value={question.correctAnswer}
              onChange={(e) => onUpdate({ correctAnswer: e.target.value })}
              placeholder="For auto-grading and analytics"
            />
          </div>
        </div>
      </div>
    </div>
  );
}


