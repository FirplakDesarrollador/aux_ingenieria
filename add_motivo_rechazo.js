// Script para agregar la columna motivo_rechazo a la tabla solicitudes
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://vuiuorjzonpyobpelyld.supabase.co';
// Usamos la anon key — el ALTER TABLE necesita service_role key
// Si falla, se dará instrucción de hacerlo desde el panel de Supabase
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1aXVvcmp6b25weW9icGVseWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY4MDM2OTksImV4cCI6MjAyMjM3OTY5OX0.ARDJuGYox9CY3K8z287nEEFBmWVLTs6yCLkHHeMMTKw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkAndAddColumn() {
    console.log('🔍 Verificando si la columna motivo_rechazo existe...');

    // Intentamos insertar con motivo_rechazo nulo para ver si ya existe
    const { data, error } = await supabase
        .from('solicitudes')
        .select('motivo_rechazo')
        .limit(1);

    if (error) {
        if (error.message.includes('motivo_rechazo')) {
            console.log('❌ La columna NO existe. Necesitas agregarla manualmente desde el panel de Supabase.');
            console.log('');
            console.log('📋 Ejecuta este SQL en el SQL Editor de Supabase:');
            console.log('');
            console.log('ALTER TABLE public.solicitudes ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;');
            console.log('');
            console.log('🔗 URL del panel: https://supabase.com/dashboard/project/vuiuorjzonpyobpelyld/sql/new');
        } else {
            console.log('❌ Error inesperado:', error.message);
        }
    } else {
        console.log('✅ La columna motivo_rechazo YA EXISTE en la tabla solicitudes.');
        console.log('   Datos de prueba:', data);
    }
}

checkAndAddColumn();
