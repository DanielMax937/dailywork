import { desc } from "drizzle-orm";
import { db } from "@/db";
import { todos } from "@/db/schema";
import { addTodo, deleteTodo, toggleTodo } from "@/actions/todo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const list = await db.select().from(todos).orderBy(desc(todos.id));

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-8 px-4 py-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Todo</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Stored in SQLite (<code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">data/sqlite.db</code>)
        </p>
      </header>

      <form action={addTodo} className="flex gap-2">
        <input
          name="title"
          type="text"
          placeholder="What needs to be done?"
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
          autoComplete="off"
          required
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Add
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {list.length === 0 ? (
          <li className="rounded-lg border border-dashed border-zinc-200 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No tasks yet. Add one above.
          </li>
        ) : (
          list.map((todo) => (
            <li
              key={todo.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <form action={toggleTodo}>
                <input type="hidden" name="id" value={todo.id ?? ""} />
                <button
                  type="submit"
                  className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  aria-label={todo.done ? "Mark as not done" : "Mark as done"}
                >
                  {todo.done ? "Undo" : "Done"}
                </button>
              </form>
              <span
                className={`min-w-0 flex-1 text-sm ${todo.done ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-100"}`}
              >
                {todo.title}
              </span>
              <form action={deleteTodo}>
                <input type="hidden" name="id" value={todo.id ?? ""} />
                <button
                  type="submit"
                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                >
                  Remove
                </button>
              </form>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
