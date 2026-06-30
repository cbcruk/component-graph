import { Profile } from './a';

export default function App() {
  const user = useCurrentUser();

  return (
    <main>
      <Profile user={user} />
      <>
        <footer>© 2026</footer>
      </>
    </main>
  );
}
