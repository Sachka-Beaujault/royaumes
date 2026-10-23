import { headers } from 'next/headers'
import { currentUser } from '@/bootstrap/server'
import { GuildScreen } from '@/modules/guild/ui'

/** Page de la Guilde. Les messages du joueur connecté y sont mis en évidence dans le chat. */
export default async function GuildPage() {
  const user = await currentUser(await headers())
  return <GuildScreen userId={user?.id ?? ''} />
}
