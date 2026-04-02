"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { todos } from "@/db/schema";

export async function addTodo(formData: FormData) {
  const title = formData.get("title");
  if (typeof title !== "string" || !title.trim()) return;
  await db.insert(todos).values({ title: title.trim() });
  revalidatePath("/");
}

export async function toggleTodo(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const idNum = Number.parseInt(id, 10);
  if (Number.isNaN(idNum)) return;
  const [row] = await db.select().from(todos).where(eq(todos.id, idNum));
  if (!row) return;
  await db.update(todos).set({ done: !row.done }).where(eq(todos.id, idNum));
  revalidatePath("/");
}

export async function deleteTodo(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const idNum = Number.parseInt(id, 10);
  if (Number.isNaN(idNum)) return;
  await db.delete(todos).where(eq(todos.id, idNum));
  revalidatePath("/");
}
