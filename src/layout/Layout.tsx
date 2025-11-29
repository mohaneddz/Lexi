export default function Layout(props: any) {
  return (
    <main class="relative flex flex-col h-screen w-screen justify-center items-center overflow-hidden">
      {props.children}
    </main>
  );
}
