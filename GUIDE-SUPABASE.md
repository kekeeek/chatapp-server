# Créer la base de données gratuite (Supabase)

1. Va sur https://supabase.com, crée un compte gratuit
2. Clique "New Project", donne-lui un nom, choisis un mot de passe pour la base (note-le bien), choisis une région proche de toi, clique "Create new project" (ça prend ~2 min)
3. Une fois le projet créé, va dans **Project Settings** (icône engrenage) → **Database**
4. Cherche la section "Connection string" → onglet **URI**
5. Copie l'URL, elle ressemble à :
   `postgresql://postgres.xxxxxxxx:[YOUR-PASSWORD]@aws-0-xxxx.pooler.supabase.com:6543/postgres`
6. Remplace `[YOUR-PASSWORD]` par le mot de passe que t'as choisi à l'étape 2

# Connecter cette base à Render

1. Va sur ton service Render (chatapp-backend)
2. Onglet **Environment** (dans le menu à gauche)
3. Clique "Add Environment Variable"
   - Key: `DATABASE_URL`
   - Value: colle l'URL Supabase complète (avec le mot de passe dedans)
4. Clique "Save Changes" → Render redéploie automatiquement

Une fois redéployé (vert "Live"), le backend est connecté à une base gratuite et permanente. Les comptes et messages ne disparaîtront plus jamais, même si Render redémarre le service.
