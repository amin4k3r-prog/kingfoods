import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {currentUser} from '@/lib/auth';
import Dashboard from './dashboard-client';
export const dynamic='force-dynamic';
export default async function Home(){const h=await headers();const user=await currentUser(new Request('https://local.invalid/',{headers:{cookie:h.get('cookie')??''}}));if(!user)redirect('/entrar');return <Dashboard user={user}/>;}
