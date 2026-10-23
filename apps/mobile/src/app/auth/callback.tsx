import { Redirect } from "expo-router";

// The OAuth browser session normally captures this redirect. If the system opens the link in
// the app instead, there is nothing to show here.
export default function AuthCallback() {
  return <Redirect href="/" />;
}
