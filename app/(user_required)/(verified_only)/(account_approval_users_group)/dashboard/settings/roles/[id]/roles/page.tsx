import UndynamicPage from './UndynamicPage';

export default async function RolesPage({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;

  // Load the component
  return <UndynamicPage id={id} />;
}
