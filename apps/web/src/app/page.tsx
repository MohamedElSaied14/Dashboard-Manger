import { redirect } from "next/navigation";

/** `/` is an alias for the dashboard; the auth guard lives in the app shell. */
export default function Home() {
  redirect("/dashboard");
}
