import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentGuild, currentUser } from '@/bootstrap/server'

// La redirection dépend de la session : la page est évaluée à chaque requête.
export const dynamic = 'force-dynamic'

/**
 * Page d'accueil : oriente vers la connexion un visiteur, vers le choix de sa guilde un joueur
 * qui n'en a pas encore, et vers son village un joueur qui en a une.
 */
export default async function Home() {
  const user = await currentUser(await headers())
  if (!user) redirect('/login')
  redirect((await currentGuild(user.id)) ? '/village' : '/guild')
}
