export type Speaker = "user" | "rizzy";

export interface Message {
  id: string;
  speaker: Speaker;
  text: string;
  createdAt: number;
}

export type RizzyStatus = "idle" | "listening" | "thinking" | "speaking";
