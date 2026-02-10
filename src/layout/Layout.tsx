export default function Layout(props: any) {
  return (
    <main className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden">
      {props.children}
    </main>
  );
}
