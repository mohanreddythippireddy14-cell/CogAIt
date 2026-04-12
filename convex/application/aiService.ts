export function enforceHelpRequestPolicy(params: {
  recentHelp: Array<{ _creationTime: number; reflectionProvided?: boolean }>;
  now: number;
}) {
  void params;
}
