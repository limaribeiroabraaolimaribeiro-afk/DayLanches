/* ──────────────────────────────────────────
   CONFIGURAÇÃO FIREBASE + CLOUDINARY
   Preencha com os dados do seu projeto Firebase.
   Acesse: https://console.firebase.google.com
────────────────────────────────────────── */

const FIREBASE_CONFIG = {
  apiKey:            "COLOCAR_API_KEY",
  authDomain:        "COLOCAR_AUTH_DOMAIN",
  projectId:         "COLOCAR_PROJECT_ID",
  storageBucket:     "COLOCAR_STORAGE_BUCKET",
  messagingSenderId: "COLOCAR_MESSAGING_SENDER_ID",
  appId:             "COLOCAR_APP_ID",
};

/* Cloudinary — criar conta grátis em cloudinary.com
   Criar um unsigned upload preset em:
   Settings > Upload > Upload presets > Add upload preset */
const CLOUDINARY_CLOUD_NAME    = "COLOCAR_CLOUD_NAME";
const CLOUDINARY_UPLOAD_PRESET = "COLOCAR_UNSIGNED_UPLOAD_PRESET";

/* Código necessário para criar novo acesso da loja */
const ACTIVATION_CODE = "DAY-LANCHES-2026";

/* ──────────────────────────────────────────
   ACESSO DE TESTE — criar no Firebase Console:
   Authentication > Users > Add user
   Email: teste@daylanches.com.br
   Senha: DayTeste123!
   Remover antes da entrega final se não precisar.
────────────────────────────────────────── */
