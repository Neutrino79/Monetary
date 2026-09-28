export interface SecurityQuestion {
  id: number;
  text: string;
}

export const SECURITY_QUESTIONS: SecurityQuestion[] = [
  { id: 1, text: "What was the name of your first pet?" },
  { id: 2, text: "What city were you born in?" },
  { id: 3, text: "What was your childhood nickname?" },
  { id: 4, text: "What is the name of your favorite teacher?" },
  { id: 5, text: "What was the make of your first car?" },
];

export const TIMEZONE_OPTIONS = ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York"];
