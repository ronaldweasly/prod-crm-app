import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase Configuration Error:');
  console.error('   VITE_SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
  console.error('   VITE_SUPABASE_ANON_KEY:', supabaseKey ? '✓ Set' : '✗ Missing');
  console.error('   Please check your .env file');
}

// Create Supabase client
export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

/**
 * Sign up a new user with email and password
 */
export async function signUpUser(email: string, password: string, metadata?: any) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Sign in user with email and password
 */
export async function signInUser(email: string, password: string) {
  try {
    console.log('[Supabase] Attempting sign in for:', email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[Supabase] Sign in error:', error.message);
      throw new Error(error.message);
    }

    console.log('[Supabase] Sign in successful, session created');
    return data;
  } catch (err: any) {
    console.error('[Supabase] Sign in exception:', err.message);
    throw err;
  }
}



/**
 * Sign out user
 */
export async function signOutUser() {
  try {
    console.log('[Supabase] Signing out');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[Supabase] Sign out error:', error.message);
      throw new Error(error.message);
    }
    console.log('[Supabase] Sign out successful');
  } catch (err: any) {
    console.error('[Supabase] Sign out exception:', err.message);
    throw err;
  }
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(error.message);
  }
  return data.user;
}

/**
 * Get current session
 */
export async function getCurrentSession() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      console.debug('[Supabase] Session found for:', data.session.user.email);
    } else {
      console.debug('[Supabase] No session found');
    }
    return data.session;
  } catch (err: any) {
    console.error('[Supabase] Session retrieval error:', err.message);
    return null;
  }
}

/**
 * Reset password
 */
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Update password
 */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Upload a file to Supabase Storage and return the public URL
 */
export async function uploadFileToStorage(file: File, folderName: string = 'general'): Promise<string> {
  // Generate a unique file name to avoid collisions
  const fileExt = file.name.split('.').pop();
  const fileName = `${folderName}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

  // Upload to the 'documents' bucket
  const { data, error } = await supabase.storage
    .from('documents')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('Supabase Storage Error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  // Get the public URL
  const { data: { publicUrl } } = supabase.storage
    .from('documents')
    .getPublicUrl(fileName);

  return publicUrl;
}

export default supabase;
