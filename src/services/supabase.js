import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://eeejsuektwduoqcqwvgm.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlZWpzdWVrdHdkdW9xY3F3dmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDk0NTksImV4cCI6MjA5MzYyNTQ1OX0.TZovBa7NaYpz37sbRhkkE8V_SopZ_hFr1audhpFsYOg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)