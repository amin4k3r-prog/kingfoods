import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {currentUser} from '@/lib/auth';
import LoginScreen from './screen';
export const dynamic='force-dynamic';
export default async function Login(){const h=await headers();const user=await currentUser(new Request('https://local.invalid/',{headers:{cookie:h.get('cookie')??''}}));if(user)redirect('/');return <LoginScreen/>;}
