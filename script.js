/* ═══════════════════════════════════════════════════════
   DAY LANCHES — CARDÁPIO DIGITAL
   JavaScript — Lógica completa do protótipo
   ═══════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────
   1. DADOS DO CARDÁPIO (mockados)
   Substitua pelas imagens reais da cliente
────────────────────────────────────────── */
const PRODUCTS = [
  /* ── AÇAÍ ── */
  {
    id: 1, cat: 'acai',
    name: 'Açaí 300ml',
    desc: 'Açaí de 300ml com leite em pó e leite condensado',
    price: 25.00,
    img: 'https://tse4.mm.bing.net/th/id/OIP.SADHoFyzV3n_a67qeGZ_4gHaHa?w=1800&h=1800&rs=1&pid=ImgDetMain&o=7&rm=3',
    badges: [],
  },
  {
    id: 2, cat: 'acai',
    name: 'Açaí 500ml',
    desc: 'Açaí cremoso e geladinho para qualquer hora',
    price: 30.00,
    img: 'https://static-images.ifood.com.br/pratos/aaf06696-490e-41fd-b22f-d24d20697363/202404291400_5845_i.jpg',
    badges: ['mais'],
  },
  {
    id: 3, cat: 'acai',
    name: 'Combo Açaí 500ml',
    desc: 'Combo mais pedido: Açaí 500ml com 3 adicionais grátis',
    price: 35.00,
    img: 'https://alphagel.com.br/wp-content/uploads/2022/04/post_thumbnail-a4af202467328269ce55eb0921bfd1d9.jpeg',
    badges: ['combo'],
  },
  {
    id: 47, cat: 'combos',
    name: 'Combo Promo',
    desc: 'X-Burger + batata por preço especial, só hoje',
    price: 29.99,
    img: "images/combo-promo.png",
    fallbackIcon: 'fa-tags',
    fallbackLabel: 'Promo',
    badges: ['novo'],
  },
  {
    id: 48, cat: 'combos',
    name: 'Combo Família',
    desc: 'Combo completo para dividir com a família',
    price: 120.00,
    img: 'https://img.magnific.com/premium-photo/tray-burgers-fries_1099965-40358.jpg',
    badges: ['dest'],
  },
  {
    id: 49, cat: 'combos',
    name: 'Combo Casal',
    desc: 'Combo perfeito para duas pessoas',
    price: 90.00,
    img: 'https://static.vecteezy.com/system/resources/previews/026/794/680/large_2x/double-hamburger-isolated-on-white-background-fresh-burger-fast-food-with-beef-and-cream-cheese-realistic-image-ultra-hd-high-design-very-detailed-free-photo.jpg',
    badges: [],
  },
  /* ── ADICIONAIS AÇAÍ (produtos da loja) ── */
  {
    id: 4, cat: 'adicionais',
    name: 'Freegells',
    desc: 'Extra forte e refrescante para qualquer hora',
    price: 2.50,
    img: 'https://paulinhodoces.com.br/wp-content/uploads/2024/02/3-4.jpg',
    badges: ['novo'],
  },
  {
    id: 5, cat: 'adicionais',
    name: 'OREO',
    desc: 'Crocante e irresistível',
    price: 5.00,
    img: 'images/oreo.webp',
    badges: ['mais'],
  },
  {
    id: 6, cat: 'adicionais',
    name: 'Paçoquinha',
    desc: 'O sabor tradicional que todo mundo ama',
    price: 1.00,
    img: 'https://a-static.mlcdn.com.br/800x560/pacoquinha-queridinha-dos-brasil-tradicional/modaestilochequebem/a3f7c1c47ad811eda7574201ac185019/49d3d8f5eddcfe6604494c4a13e33f15.jpeg',
    badges: [],
  },
  {
    id: 7, cat: 'adicionais',
    name: 'Pirulito',
    desc: 'Docinho que alegra qualquer momento',
    price: 0.50,
    img: 'https://segredosdomundo.r7.com/wp-content/uploads/2020/09/pirulito-a-historia-por-tras-do-desenvolvimento-do-doce-em-palito-1-scaled.jpg',
    badges: [],
  },
  /* ── HAMBÚRGUER ── */
  {
    id: 8, cat: 'hamburguer',
    name: 'Burguer Duplo',
    desc: 'Dois hambúrgueres, queijo duplo e lanche reforçado',
    price: 20.00,
    img: 'https://img.magnific.com/fotos-premium/burger-costeleta-dupla-queijo-cheddar-duplo-bacon-cebola-frita-picles-molho-e-pao-artesanal_524291-99.jpg?w=740',
    badges: [],
  },
  {
    id: 9, cat: 'hamburguer',
    name: 'X-Burger',
    desc: 'Hambúrguer clássico, simples e muito saboroso',
    price: 18.00,
    img: 'https://cdn.sanity.io/images/8ngmz6db/production/a8384252d6bce85debd94c3b5b9515aae7e34d7d-1024x1024.webp',
    badges: ['mais'],
  },
  {
    id: 10, cat: 'hamburguer',
    name: 'X-Salada',
    desc: 'Hambúrguer com salada fresca, queijo e molho especial',
    price: 24.00,
    img: 'https://www.montarumnegocio.com/wp-content/uploads/2017/06/Como-fazer-x-Salada-na-chapa-para-vender.jpg',
    badges: [],
  },
  {
    id: 37, cat: 'hamburguer',
    name: 'X-Tudo',
    desc: 'Hambúrguer super recheado, completo e bem servido',
    price: 90.00,
    img: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1b/aa/72/3b/todoterreno.jpg?w=400&h=-1&s=1',
    badges: ['dest'],
  },
  {
    id: 38, cat: 'hamburguer',
    name: 'X-Frango',
    desc: 'Hambúrguer de frango saboroso e bem montado',
    price: 32.00,
    img: 'https://static.vecteezy.com/system/resources/thumbnails/029/839/218/small_2x/double-hamburger-isolated-on-black-background-ai-generative-photo.jpg',
    badges: [],
  },
  {
    id: 39, cat: 'hamburguer',
    name: 'X-Egg',
    desc: 'Hambúrguer com ovo, queijo e acompanhamentos especiais',
    price: 28.00,
    img: 'https://img.freepik.com/fotos-premium/um-hamburguer-com-um-ovo-frito_900321-27508.jpg',
    badges: [],
  },
  {
    id: 40, cat: 'hamburguer',
    name: 'X-Coração',
    desc: 'Lanche especial com coração, bacon e muito sabor',
    price: 35.00,
    img: 'https://www.fastburguerx.com.br/public/files/produtos/fast-x-coracao-com-bacon-964-3142.webp',
    badges: [],
  },
  {
    id: 41, cat: 'hamburguer',
    name: 'X-Calabresa',
    desc: 'Hambúrguer com calabresa, queijo e molho marcante',
    price: 32.00,
    img: 'https://i.pinimg.com/originals/8c/16/16/8c1616fcbac07e42db01f61cb5190180.jpg',
    badges: [],
  },
  {
    id: 42, cat: 'hamburguer',
    name: 'X-Alcatra',
    desc: 'Hambúrguer premium de alcatra com muito sabor',
    price: 38.00,
    img: 'https://minervafoods.com/wp-content/uploads/2023/09/HamburguerAlcatraComBacon_1-1920x1274.jpg',
    badges: [],
  },
  /* ── ARTESANAIS ── */
  {
    id: 11, cat: 'artesanais',
    name: 'X-Bacon',
    desc: 'Hambúrguer artesanal com bacon crocante',
    price: 32.00,
    img: 'https://icookfortwo.com/wp-content/uploads/2022/06/featured-peanut-butter-bacon-burger-768x512.jpg',
    badges: ['dest'],
  },
  {
    id: 50, cat: 'artesanais',
    name: 'X Egg Artesanal',
    desc: 'Artesanal com ovo, queijo e muito sabor',
    price: 35.00,
    img: 'https://img.magnific.com/premium-photo/cheeseburger-with-crispy-fried-egg_1179130-129084.jpg',
    badges: [],
  },
  {
    id: 51, cat: 'artesanais',
    name: 'Top Burger Cheddar',
    desc: 'Pão, burger com carne bovina, queijo cheddar e fritas',
    price: 35.00,
    img: 'https://cdn.mer-cat.com/cheddarsburger/400x400/img/product/classic_1692680374I1qp4L.jpg?pass=eyJhbGciOiJIUzI1NiJ9.eyJkYXRhIjoiNDAweDQwMC9pbWcvcHJvZHVjdC9jbGFzc2ljXzE2OTI2ODAzNzRJMXFwNEwuanBnIn0.KcW577fdbWgfM5nPH91sLNdN4jGt__G7FbG12SABg1E',
    badges: [],
  },
  {
    id: 52, cat: 'artesanais',
    name: 'Big Picanha',
    desc: 'Pão, tomate, alface, burger bovino, picanha fatiada 150g, queijo, molho especial e fritas',
    price: 56.00,
    img: 'https://minervafoods.com/wp-content/uploads/2022/12/burguer-de-picanha.jpg',
    badges: ['dest'],
  },
  {
    id: 53, cat: 'artesanais',
    name: 'Big Classic',
    desc: 'Hambúrguer artesanal clássico com queijo, salada e molho especial',
    price: 38.00,
    img: 'https://saudelab.com/wp-content/uploads/2023/02/hamburguer-caseiro-artesanal.jpg',
    badges: [],
  },
  {
    id: 54, cat: 'artesanais',
    name: 'Big Calabresa',
    desc: 'Hambúrguer artesanal com calabresa, queijo e molho especial',
    price: 40.00,
    img: 'https://static-images.ifood.com.br/pratos/ddbb1ad7-e3e8-49bc-8afe-fea17bf84b5f/202411031750_K5WP_i.jpg',
    badges: [],
  },
  {
    id: 55, cat: 'artesanais',
    name: 'Big Bacon',
    desc: 'Hambúrguer artesanal com bacon crocante, queijo e molho especial',
    price: 40.00,
    img: 'https://www.fullerssugarhouse.com/wp-content/uploads/2021/08/maplebaconburger.jpg',
    badges: [],
  },
  /* ── HOT DOGS ── */
  {
    id: 12, cat: 'hotdog',
    name: 'Hot Dog Simples',
    desc: 'Cachorro-quente tradicional, completo e saboroso',
    price: 20.00,
    img: 'https://www.comidaereceitas.com.br/wp-content/uploads/2019/06/Cachorro-quente-completo-freepik-780x520.jpg',
    badges: [],
  },
  {
    id: 13, cat: 'hotdog',
    name: 'Hot Dog Bacon',
    desc: 'Hot dog caprichado com bacon crocante e molho especial',
    price: 28.00,
    img: 'https://receitasbr.com.br/wp-content/uploads/2023/06/cachorro-quente-com-bacon.jpg',
    badges: ['novo'],
  },
  {
    id: 34, cat: 'hotdog',
    name: 'Hot Dog Calabresa',
    desc: 'Hot dog com calabresa acebolada e muito sabor',
    price: 28.00,
    img: 'https://s2.glbimg.com/1xoFGeFPFrMqqeE2yufX5EFSe0c=/1200x/smart/filters:cover():strip_icc()/i.s3.glbimg.com/v1/AUTH_1f540e0b94d8437dbbc39d567a1dee68/internal_photos/bs/2021/7/w/YNR7wZQEGsRUDdJ9OvhQ/cachorro-quente-de-calabresa-acebolada.jpg',
    badges: [],
  },
  {
    id: 35, cat: 'hotdog',
    name: 'Hot Dog Duplo',
    desc: 'Dois sabores em um lanche reforçado e bem recheado',
    price: 22.00,
    img: 'https://img.magnific.com/fotos-premium/cachorro-quente-com-salsicha-grande-recheada-com-maionese-derretida-e-uma-pitada-de-verduras-picadas_358001-22843.jpg',
    badges: [],
  },
  {
    id: 36, cat: 'hotdog',
    name: 'Hot Dog Frango',
    desc: 'Hot dog com frango cremoso, molhos e acompanhamentos',
    price: 29.00,
    img: 'https://imagens.imirante.com.br/imagens/noticias/2023/12/26/VMWgzaAS96O9BGbuCr5dqJ8jPsYzhk3wLMBkmPaN.png?w=896&h=448&crop=538%2C+269%2C+0%2C+39.5&fit=crop&s=9db2068290bfcbb5652c1b84952f901d',
    badges: [],
  },
  /* ── PORÇÕES ── */
  {
    id: 14, cat: 'porcoes',
    name: 'Fritas 500g',
    desc: 'Porção de batata frita crocante e dourada',
    price: 32.00,
    img: 'https://www.cenariomt.com.br/wp-content/uploads/2023/04/como-fazer-batata-frita-na-airfryer-1024x576.jpg',
    badges: ['mais'],
  },
  {
    id: 15, cat: 'porcoes',
    name: 'Fritas com Bacon e Cheddar',
    desc: 'Fritas com cheddar cremoso e bacon crocante',
    price: 49.00,
    img: 'https://img.magnific.com/fotos-premium/lanche-hd-8k-papel-de-parede-imagem-fotografica_890746-78783.jpg',
    badges: ['dest'],
  },
  {
    id: 43, cat: 'porcoes',
    name: 'Porção Mista',
    desc: 'Porção completa e bem servida para compartilhar',
    price: 100.00,
    img: 'https://i.pinimg.com/originals/c4/52/85/c45285b431ccf7c033887e8304d95c3c.png',
    badges: [],
  },
  {
    id: 44, cat: 'porcoes',
    name: 'Picanha com Fritas',
    desc: 'Picanha saborosa acompanhada de fritas crocantes',
    price: 140.00,
    img: 'https://3.bp.blogspot.com/-MGV8o-XpXoA/WP4a601kpWI/AAAAAAAAHIs/oe-hhmu-xBk6nKG2_drwsmVG8OAsLZsfwCLcB/s1600/6001_940x582-940x582.jpg',
    badges: ['dest'],
  },
  {
    id: 45, cat: 'porcoes',
    name: 'Fritas e Calabresa',
    desc: 'Batata frita crocante com calabresa acebolada',
    price: 45.00,
    img: 'https://i.pinimg.com/originals/ec/6f/22/ec6f22c945adacc41063e6c90c8d889e.png',
    badges: [],
  },
  {
    id: 46, cat: 'porcoes',
    name: 'Batata com Bacon',
    desc: 'Batata frita com bacon crocante e muito sabor',
    price: 45.00,
    img: 'https://i.pinimg.com/originals/58/b1/a5/58b1a53af1d150d879cd77305487d5da.png',
    badges: [],
  },
  /* ── BEBIDAS ── */
  {
    id: 16, cat: 'bebidas',
    name: 'Coca-Cola 2 Litros',
    desc: 'Gelada, perfeita para acompanhar seu pedido',
    price: 16.00,
    img: 'https://andinacocacola.vtexassets.com/arquivos/ids/158758-800-auto?aspect=true&height=auto&v=639156020671730000&width=800',
    badges: [],
  },
  {
    id: 17, cat: 'bebidas',
    name: 'Água',
    desc: 'Água mineral gelada, perfeita para qualquer momento',
    price: 3.00,
    img: 'https://aguamineralhydrate.com.br/wp-content/uploads/2016/02/Garrafa-Agua-Mineral-500-ml-pacote-12-unidades.jpg',
    badges: [],
  },
  {
    id: 18, cat: 'bebidas',
    name: 'Caipirinha',
    desc: 'Caipirinha artesanal gelada e refrescante',
    price: 20.00,
    img: 'https://cdn.thefreshmancook.com/wp-content/uploads/2024/04/Caipirinha-Recipe-2-1024x1024.jpg',
    badges: [],
  },
  {
    id: 19, cat: 'bebidas',
    name: 'Caixa de Brahma',
    desc: 'Caixa com cervejas Brahma geladas',
    price: 60.00,
    img: 'https://choppbrahmaexpress.vtexassets.com/arquivos/ids/158114-800-auto?v=638410151046000000&width=800&height=auto&aspect=true',
    badges: [],
  },
  {
    id: 20, cat: 'bebidas',
    name: 'Caixa de Kaiser',
    desc: 'Caixa com cervejas Kaiser geladas',
    price: 50.00,
    img: 'https://2.bp.blogspot.com/-3jCrEZl2hjA/V_fDGDiIrQI/AAAAAAABjOg/jMpPn9PaDscn31Do1quhmNGclWpZdGQVACLcB/s1600/kaiser%2B6.jpg',
    badges: [],
  },
  {
    id: 21, cat: 'bebidas',
    name: 'Caixa de Skol',
    desc: 'Caixa com cervejas Skol geladas',
    price: 60.00,
    img: 'https://http2.mlstatic.com/D_NQ_NP_2X_909577-MLB45554443155_042021-F.jpg',
    badges: [],
  },
  {
    id: 22, cat: 'bebidas',
    name: 'Coca-Cola 600ml',
    desc: 'Coca-Cola garrafa 600ml gelada',
    price: 9.00,
    img: 'https://tse3.mm.bing.net/th/id/OIP.AvYbB6jhJxGC_SCus4CpwwHaHa?w=2847&h=2847&rs=1&pid=ImgDetMain&o=7&rm=3',
    badges: [],
  },
  {
    id: 23, cat: 'bebidas',
    name: 'Coca-Cola Lata',
    desc: 'Coca-Cola lata 350ml gelada',
    price: 6.00,
    img: 'https://static.vecteezy.com/system/resources/previews/047/280/244/non_2x/a-can-of-coca-cola-on-a-white-background-free-photo.jpg',
    badges: [],
  },
  {
    id: 24, cat: 'bebidas',
    name: 'Copão',
    desc: 'Whisky, gin, vodka e muitos outros drinks',
    price: 25.00,
    img: 'images/copao.jpg',
    badges: [],
  },
  {
    id: 25, cat: 'bebidas',
    name: 'Del Valle',
    desc: 'Suco Del Valle gelado, vários sabores',
    price: 7.00,
    img: 'https://andinacocacola.vtexassets.com/arquivos/ids/158622-800-auto?aspect=true&height=auto&v=639094449084230000&width=800',
    badges: [],
  },
  {
    id: 26, cat: 'bebidas',
    name: 'Guaraná',
    desc: 'Guaraná Antarctica gelado e refrescante',
    price: 6.00,
    img: 'https://drogariacristina.com.br/BACKOFFICE/Uploads/Produto/Normal/7891991000826.jpg',
    badges: [],
  },
  {
    id: 27, cat: 'bebidas',
    name: 'Kaiser',
    desc: 'Cerveja Kaiser lata 350ml gelada',
    price: 6.00,
    img: 'https://cdn.irmaospatrocinio.com.br/img/p/1/6/8/9/5/4/168954-thickbox_default.jpg',
    badges: [],
  },
  {
    id: 28, cat: 'bebidas',
    name: 'Mini Coca',
    desc: 'Coca-Cola mini 250ml gelada',
    price: 3.00,
    img: 'https://www.sanmiguelchapultepec.shop/wp-content/uploads/2020/04/coca-cola-mini-250-ml.jpg',
    badges: [],
  },
  {
    id: 29, cat: 'bebidas',
    name: 'Red Bull',
    desc: 'Red Bull energético 250ml',
    price: 15.00,
    img: 'https://barcodelive.org/filemanager/data-images/imgs/20230223/News_10%20Best%20Red%20Bull%20Flavors%20You%20Should%20Try_2.jpg',
    badges: [],
  },
  {
    id: 30, cat: 'bebidas',
    name: 'Skol Lata',
    desc: 'Cerveja Skol lata 350ml gelada',
    price: 7.00,
    img: 'https://a-static.mlcdn.com.br/800x560/cerveja-skol-lata-caixa-com-12/bartropical/9479d15413fb11ed853c4201ac185079/dd3eccaf4fa30803d455dd28510aad07.jpg',
    badges: [],
  },
  {
    id: 31, cat: 'bebidas',
    name: 'Brahma',
    desc: 'Cerveja Brahma lata 350ml gelada',
    price: 7.00,
    img: 'https://choppbrahmaexpress.vtexassets.com/arquivos/ids/155702/brahma-lata-350ml.jpg?v=637353454674430000',
    badges: [],
  },
  {
    id: 32, cat: 'bebidas',
    name: 'Heineken',
    desc: 'Cerveja Heineken 330ml gelada',
    price: 12.00,
    img: 'https://jamaicagetawaytravels.com/wp-content/uploads/2020/06/Heineken.jpg',
    badges: ['mais'],
  },
  {
    id: 33, cat: 'bebidas',
    name: 'Heineken Zero',
    desc: 'Heineken Zero Álcool 330ml',
    price: 7.00,
    img: 'https://penielvicfalls.com/wp-content/uploads/2024/09/Heineken-zero-1024x1024.jpeg',
    badges: [],
  },
  /* ── SALGADINHOS ── */
  {
    id: 56, cat: 'salgadinhos',
    name: 'Salgadinho Quero S. Mais',
    desc: 'Salgadinho crocante para acompanhar seu pedido',
    price: 2.50,
    img: 'https://ac9d37e35c0a3dbcbeefb2c0db18e07b.cdn.bubble.io/f1726700761916x375871732471283000/SalgadosHero.webp?ignore_imgix',
    badges: [],
  },
  {
    id: 57, cat: 'salgadinhos',
    name: 'Salgadinho Nacho',
    desc: 'Nachos crocantes e cheios de sabor',
    price: 5.00,
    img: 'https://static.itdg.com.br/images/auto-auto/258b003211e5e4925693b5dfac1d6ca6/nachos-4-ingredientes.jpg',
    badges: [],
  },
  {
    id: 58, cat: 'salgadinhos',
    name: 'Salgadinho Batata',
    desc: 'Salgadinho sabor batata, crocante e saboroso',
    price: 5.00,
    img: 'https://paulistaoatacadista.vtexassets.com/arquivos/ids/377999/SalgadinhoBatataLaysClassica70g1.jpg?v=638469844938770000',
    badges: [],
  },
  {
    id: 59, cat: 'salgadinhos',
    name: 'Salgadinho Bacon',
    desc: 'Salgadinho sabor bacon, perfeito para beliscar',
    price: 5.00,
    img: 'https://d21wiczbqxib04.cloudfront.net/w4q2-fCq48EEKLo9GFSi45JRXx8=/fit-in/600x0/filters:fill(FFFFFF):background_color(white)/https://osuper-ecommerce-koch.s3.sa-east-1.amazonaws.com/bb49cb09-SalgadinhodeBaconNabeli100G_69318.jpeg',
    badges: [],
  },
];

/* Lista ativa: Supabase quando carregado, senão fallback local */
let PRODUCTS_DATA = [];

function getProductsList() {
  return PRODUCTS_DATA.length ? PRODUCTS_DATA : (window.PRODUCTS_LOCAL || PRODUCTS);
}

/* Busca por UUID, localId (id numérico antigo) ou slug */
function findProductByAnyId(id) {
  const s = String(id);
  return getProductsList().find(p =>
    String(p.id) === s ||
    (p.localId != null && String(p.localId) === s) ||
    (p.slug && p.slug === s)
  );
}

/* Nomes dos açaís — fallback quando localId ainda não foi sincronizado */
const ACAI_PRODUCT_NAMES = ['Açaí 300ml', 'Açaí 500ml', 'Combo Açaí 500ml'];
const ACAI_COMBO_NAME    = 'Combo Açaí 500ml';

/* Produtos para o carrossel — por flag hero, depois por nome, depois por badge */
function getHeroProducts() {
  const products = getProductsList();
  const byFlag = products.filter(p => p.hero === true);
  if (byFlag.length >= 2) return byFlag;

  const fallbackNames = [
    'Açaí 500ml', 'Combo Açaí 500ml', 'Burguer Duplo',
    'X-Bacon', 'Fritas com Bacon e Cheddar', 'Coca-Cola 2 Litros',
  ];
  const byName = fallbackNames
    .map(n => products.find(p => p.name?.toLowerCase() === n.toLowerCase()))
    .filter(Boolean);
  if (byName.length >= 2) return byName;

  const withBadge = products.filter(p => p.badges?.length > 0).slice(0, 6);
  if (withBadge.length > 0) return withBadge;
  return products.filter(p => p.img).slice(0, 6);
}

const ACAI_CUSTOM_PRODUCT_IDS = [1, 2, 3];
const ACAI_COMBO_PRODUCT_ID = 3;
const ACAI_COMBO_FREE_LIMIT = 3;
const ACAI_ADDONS = [
  { id: 'choc-branco',      name: 'Chocolate branco',          price: 5.00 },
  { id: 'choc-preto',       name: 'Chocolate preto',           price: 5.00 },
  { id: 'choc-branco-oreo', name: 'Chocolate branco com OREO', price: 5.00 },
  { id: 'morango',          name: 'Morango',                   price: 5.00 },
  { id: 'nutella',          name: 'Nutella',                   price: 5.00 },
  { id: 'mms',              name: 'M&Ms',                      price: 5.00 },
  { id: 'granola',          name: 'Granola',                   price: 5.00 },
  { id: 'pacoca',           name: 'Paçoca',                    price: 5.00 },
];

/* ──────────────────────────────────────────
   2. ESTADO DA APLICAÇÃO
────────────────────────────────────────── */
const state = {
  cart:        [],         /* [{ id, name, price, img, qty }] */
  page:        'catalog',  /* catalog | delivery | payment | confirmation */
  cartOpen:    false,
  cat:         'all',
  search:      '',
  deliveryType: 'delivery',  /* delivery | pickup */
  form: {
    name: '', phone: '', notes: '', troco: '',
  },
  geo: { lat: null, lon: null, accuracy: null, link: '', routeLink: '', address: '', distanceKm: null, straightDistanceKm: null },
  payMethod:   '',
  payStatus:   'idle',     /* idle | waiting | confirmed | production */
  couponApplied: false,
  discount:    0,
  orderId:     null,
};

const VALID_COUPONS = { 'DAY10': 10, 'PROMO5': 5 };

/* Valores usados apenas se store_settings não tiver delivery_price_per_km/route_factor salvos */
const DELIVERY_PRICE_PER_KM_FALLBACK = 2.50;
const DELIVERY_ROUTE_FACTOR_FALLBACK = 1.4; /* Haversine é linha reta; fator estima rota real */

/* ──────────────────────────────────────────
   SUPABASE — integração
────────────────────────────────────────── */
function getSb() {
  return window.supabaseClient || null;
}

async function saveOrderToSupabase(orderData) {
  const sb = getSb();
  if (!sb) throw new Error('Supabase não disponível');
  const { error } = await sb.from('orders').insert(orderData);
  if (error) throw error;
}

async function loadProductsFromDatabase() {
  try {
    const db = getSb();
    if (!db) {
      console.warn('Supabase não carregado. Usando produtos locais.');
      return;
    }
    const { data, error } = await db
      .from('products')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true });
    if (error) {
      console.error('Erro ao carregar produtos do Supabase:', error);
      return;
    }
    if (data && data.length > 0) {
      /* Descobrir quais produtos têm grupos de opções ativos */
      const productIds = data.map(p => p.id);
      let withOptions = new Set();
      try {
        const { data: optGroups } = await db
          .from('product_option_groups')
          .select('product_id')
          .in('product_id', productIds)
          .eq('active', true);
        withOptions = new Set((optGroups || []).map(g => g.product_id));
      } catch(_) { /* opcional — não bloqueia carregamento */ }

      PRODUCTS_DATA = data.map(p => ({
        id:             p.id,
        localId:        p.local_id != null ? String(p.local_id) : null,
        name:           p.name,
        desc:           p.description || '',
        price:          Number(p.price || 0),
        cat:            p.category,
        img:            p.image_url || '',
        badges:         p.badges || [],
        allowAcaiAddons: !!p.allow_acai_addons,
        freeAddonLimit: Number(p.free_addon_limit || 0),
        displayOrder:   Number(p.display_order || 0),
        slug:           p.slug || '',
        featured:       !!p.featured,
        hero:           !!p.hero,
        hasOptions:     withOptions.has(p.id),
      }));
      console.log('Produtos carregados do Supabase:', PRODUCTS_DATA.length);
    } else {
      console.warn('Supabase vazio. Usando produtos locais.');
    }
  } catch(err) {
    console.error('Falha ao carregar produtos:', err);
  }
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isStoreLocationConfigured() {
  const cfg = storeConfig || {};
  return cfg.store_lat != null && cfg.store_lon != null;
}

function calculateDeliveryFeeByKm() {
  if (state.deliveryType === 'pickup') return 0;
  if (!state.geo.lat || !state.geo.lon) return 0;
  if (!isStoreLocationConfigured()) return 0;

  const cfg         = storeConfig || {};
  const storeLat    = Number(cfg.store_lat);
  const storeLon    = Number(cfg.store_lon);
  const customerLat = Number(state.geo.lat);
  const customerLon = Number(state.geo.lon);
  const routeFactor = Number(cfg.route_factor) || DELIVERY_ROUTE_FACTOR_FALLBACK;
  const pricePerKm  = Number(cfg.delivery_price_per_km) || DELIVERY_PRICE_PER_KM_FALLBACK;

  const rawDistanceKm = calculateDistanceKm(storeLat, storeLon, customerLat, customerLon);
  let estimatedDistanceKm = rawDistanceKm * routeFactor;
  let freight = Math.ceil(estimatedDistanceKm * pricePerKm);

  if (rawDistanceKm < 0.2) {
    estimatedDistanceKm = 0;
    freight = 0;
  }

  state.geo.straightDistanceKm = rawDistanceKm;
  state.geo.distanceKm         = estimatedDistanceKm;

  console.log('[FRETE DEBUG]', {
    storeLat, storeLon, customerLat, customerLon,
    rawDistanceKm, routeFactor, estimatedDistanceKm,
    deliveryPricePerKm: pricePerKm, freight,
  });

  return freight;
}

/* ── CONFIGURAÇÕES DA LOJA ── */
// Trocar pelo número real no formato internacional (sem + e sem espaços)
const STORE_WHATSAPP = "5547991559926";
// Trocar pela chave PIX real da loja (celular, CPF, email ou chave aleatória)
const PIX_KEY = "47997483342";

/* ──────────────────────────────────────────
   3. NAVEGAÇÃO
────────────────────────────────────────── */
function navigateTo(page) {
  if (ppProductId) closeProductPage();
  if (spOpen) closeSearchPage();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  state.page = page;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (page === 'delivery') {
    state.geo = { lat: null, lon: null, link: '', routeLink: '', address: '', distanceKm: null, straightDistanceKm: null };
    const btn = el('btn-geo');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-location-dot"></i> Usar minha localização atual'; btn.classList.remove('btn-geo-done'); }
    const stat = el('geo-status');
    if (stat) stat.style.display = 'none';
  }
  if (page === 'payment') {
    updatePaymentPage();
  }
  if (page === 'confirmation') {
    updateConfirmationPage();
  }
}

function goBack() {
  const prev = { delivery: 'catalog', payment: 'delivery', confirmation: 'catalog' };
  navigateTo(prev[state.page] || 'catalog');
}

function setDeliveryType(type) {
  state.deliveryType = type;
  const geoCard = el('geo-card');
  if (geoCard) geoCard.style.display = type === 'pickup' ? 'none' : 'block';
  updateCartBar();
}

const BR_STATE_ABBR = {
  'acre':'AC','alagoas':'AL','amapá':'AP','amapa':'AP','amazonas':'AM','bahia':'BA','ceará':'CE','ceara':'CE',
  'distrito federal':'DF','espírito santo':'ES','espirito santo':'ES','goiás':'GO','goias':'GO','maranhão':'MA','maranhao':'MA',
  'mato grosso':'MT','mato grosso do sul':'MS','minas gerais':'MG','pará':'PA','para':'PA','paraíba':'PB','paraiba':'PB',
  'paraná':'PR','parana':'PR','pernambuco':'PE','piauí':'PI','piaui':'PI','rio de janeiro':'RJ','rio grande do norte':'RN',
  'rio grande do sul':'RS','rondônia':'RO','rondonia':'RO','roraima':'RR','santa catarina':'SC','são paulo':'SP','sao paulo':'SP',
  'sergipe':'SE','tocantins':'TO',
};

/* Monta um endereço curto (rua, bairro, cidade - estado) a partir do
   retorno de reverse geocoding. Sem CEP, país ou número da casa. */
function formatCustomerAddressFromGeocode(data) {
  const address = data?.address || {};

  const road   = address.road || address.street || address.pedestrian || address.residential || '';
  const suburb = address.suburb || address.neighbourhood || address.quarter || address.village || address.hamlet || '';
  const city   = address.city || address.town || address.municipality || address.county || '';
  const state  = BR_STATE_ABBR[String(address.state || '').toLowerCase()] || address.state || '';

  const lines = [];
  if (road)   lines.push(road);
  if (suburb) lines.push(suburb);

  const cityState = [city, state].filter(Boolean).join(' - ');
  if (cityState) lines.push(cityState);

  return lines.join('\n').trim();
}

function requestGeoLocation() {
  const btn  = el('btn-geo');
  const stat = el('geo-status');

  if (!isStoreLocationConfigured()) {
    showToast('Localização da loja não configurada. Entre em contato com a loja.');
    return;
  }

  if (!navigator.geolocation) {
    showToast('Geolocalização não disponível neste navegador.');
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Obtendo localização...'; }

  navigator.geolocation.getCurrentPosition(
    async pos => {
      const lat  = pos.coords.latitude.toFixed(6);
      const lon  = pos.coords.longitude.toFixed(6);
      const link = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
      const cfg  = storeConfig || {};
      const routeLink = `https://www.google.com/maps/dir/?api=1&origin=${cfg.store_lat},${cfg.store_lon}&destination=${lat},${lon}`;

      state.geo = { lat, lon, accuracy: pos.coords.accuracy || null, link, routeLink, address: '', straightDistanceKm: null, distanceKm: null };
      const fee       = calculateDeliveryFeeByKm();
      const estimated = state.geo.distanceKm || 0;

      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Localização obtida'; btn.classList.add('btn-geo-done'); }
      if (stat) {
        stat.style.display = 'block';
        stat.innerHTML = `
          <div class="geo-success">
            <i class="fas fa-check-circle"></i>
            <span>Localização obtida</span>
          </div>
          <div class="geo-fee-info">
            <span><i class="fas fa-route"></i> Distância aproximada: <strong>${estimated.toFixed(1).replace('.', ',')} km</strong></span>
            <span><i class="fas fa-motorcycle"></i> Frete: <strong>R$ ${fmt(fee)}</strong></span>
          </div>
          <p id="geo-address-info" class="geo-address-info"><i class="fas fa-spinner fa-spin"></i> Buscando endereço aproximado…</p>
          <a href="${link}" target="_blank" rel="noopener" class="geo-map-link">
            <i class="fas fa-map-location-dot"></i> Abrir no mapa
          </a>`;
      }
      updateCartBar();
      showToast('Localização adicionada com sucesso!');

      /* Reverse geocoding: converte coordenadas em endereço escrito */
      try {
        const res  = await fetch(`${WORKER_URL}/reverse-geocode?lat=${lat}&lon=${lon}`);
        const data = await res.json();
        state.geo.address = formatCustomerAddressFromGeocode({ address: data?.raw || {} });
      } catch (err) {
        console.error('[DayLanches] Erro no reverse geocode:', err);
        state.geo.address = '';
      }

      const addrInfo = el('geo-address-info');
      if (addrInfo) {
        addrInfo.innerHTML = state.geo.address
          ? `<i class="fas fa-location-dot"></i> Endereço aproximado: ${esc(state.geo.address.replace(/\n/g, ', '))}`
          : `<i class="fas fa-circle-info"></i> Localização obtida. Endereço aproximado indisponível.`;
      }
    },
    err => {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-location-dot"></i> Usar minha localização atual'; }
      const msgs = { 1: 'Permissão negada. Você pode continuar sem localização.', 2: 'Localização indisponível.', 3: 'Tempo esgotado. Tente novamente.' };
      showToast(msgs[err.code] || 'Não foi possível obter a localização.');
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

/* Fluxo InfinitePay: salva pedido → cria checkout → redireciona */
async function handleOnlinePayment(method) {
  if (state.deliveryType === 'delivery' && !isStoreLocationConfigured()) {
    showToast('Localização da loja não configurada. Entre em contato com a loja.');
    return;
  }
  if (state.deliveryType === 'delivery' && !state.geo.lat) {
    showToast('Para entrega, use o botão de localização antes de continuar.');
    navigateTo('delivery');
    return;
  }

  state.payMethod = method;
  state.orderId   = Math.floor(Math.random() * 90000) + 10000;

  const f = state.form;
  const orderNumber = `DL-${state.orderId}`;
  const orderData = {
    order_number:     orderNumber,
    customer_name:    f.name,
    customer_phone:   f.phone || '',
    delivery_type:    state.deliveryType,
    items: state.cart.map(i => ({
      id:             i.id,
      name:           i.name,
      qty:            i.qty,
      unitPrice:      i.basePrice || getItemUnitPrice(i),
      finalUnitPrice: getItemUnitPrice(i),
      options:        i.options || [],
      addons:         i.addons  || [],
      total:          getItemTotal(i),
    })),
    subtotal:         getSubtotal(),
    delivery_fee:     getDeliveryFee(),
    total:            getTotal(),
    payment_method:   method,
    payment_status:   'aguardando_pagamento',
    payment_provider: 'infinitepay',
    notes:            f.notes || '',
    troco:            null,
    location: state.geo.lat ? {
      lat:       state.geo.lat,
      lng:       state.geo.lon,
      accuracy:  state.geo.accuracy || null,
      mapsLink:  state.geo.link,
      routeLink: state.geo.routeLink,
      address:   state.geo.address || null,
    } : null,
    customer_address_text: state.geo.address || null,
    status:           'aguardando_pagamento',
    whatsapp_opt_in:  false,
    whatsapp_sent:    false,
  };

  /* 1. Salvar pedido no Supabase */
  try {
    await saveOrderToSupabase(orderData);
  } catch (err) {
    console.error('[DayLanches] Erro ao salvar pedido online:', err);
    showToast('Não foi possível registrar seu pedido. Tente novamente.');
    return;
  }

  /* 2. Criar checkout InfinitePay via Worker */
  showToast('Gerando link de pagamento…');
  let checkoutUrl;
  try {
    const res = await fetch(`${WORKER_URL}/create-payment`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orderNumber }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.minValue) {
        showToast('Para pagamento online, o pedido precisa ser maior que R$ 1,00.');
      } else {
        showToast('Não foi possível gerar o pagamento. Tente novamente.');
      }
      return;
    }
    checkoutUrl = data.checkoutUrl;
  } catch (err) {
    console.error('[DayLanches] Erro ao criar pagamento:', err);
    showToast('Não foi possível gerar o pagamento. Tente novamente.');
    return;
  }

  /* 3. Salvar dados no localStorage para a página obrigado */
  try {
    localStorage.setItem('lastOrderNumber', orderNumber);
    localStorage.setItem('lastOrderTotal',  String(getTotal()));
    localStorage.setItem('lastOrderMethod', method);
  } catch(_) {}

  /* 4. Redirecionar para checkout InfinitePay */
  window.location.href = checkoutUrl;
}

function handleCashPayment() {
  if (state.deliveryType === 'delivery' && !state.geo.lat) {
    showToast('Para entrega, use o botão de localização antes de continuar.');
    navigateTo('delivery');
    return;
  }
  openTrocoModal();
}

function openTrocoModal() {
  const modal = el('troco-modal');
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  const inp = el('troco-input');
  if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 100); }
}

function closeTrocoModal() {
  const modal = el('troco-modal');
  if (modal) modal.style.display = 'none';
  if (!state.cartOpen && !spOpen) document.body.style.overflow = '';
}

function closeTrocoModalOutside(e) {
  if (e.target === el('troco-modal')) closeTrocoModal();
}

async function confirmCashPayment() {
  state.payMethod = 'cash';
  state.orderId   = state.orderId || Math.floor(Math.random() * 90000) + 10000;
  closeTrocoModal();
  const ok = await sendWhatsApp();
  if (ok) navigateTo('confirmation');
}

function openPixPage() {
  const keyEl = el('pix-key-display');
  if (keyEl) keyEl.textContent = PIX_KEY;
  const page = el('pix-page');
  if (page) { page.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function closePixPage() {
  const page = el('pix-page');
  if (page) page.classList.remove('open');
  if (!state.cartOpen && !spOpen) document.body.style.overflow = '';
}

/* ──────────────────────────────────────────
   4. CARRINHO
────────────────────────────────────────── */
function isAcaiCustomProduct(productOrId) {
  if (typeof productOrId === 'object' && productOrId !== null) {
    const p = productOrId;
    if (ACAI_PRODUCT_NAMES.includes(p.name)) return true;
    if (ACAI_CUSTOM_PRODUCT_IDS.includes(Number(p.localId))) return true;
    if (ACAI_CUSTOM_PRODUCT_IDS.includes(Number(p.id))) return true;
    return false;
  }
  const found = findProductByAnyId(productOrId);
  if (found) return isAcaiCustomProduct(found);
  return ACAI_CUSTOM_PRODUCT_IDS.includes(Number(productOrId));
}

/* Produto que precisa que o cliente abra a página para escolher opções */
function productNeedsChoice(product) {
  if (!product) return false;
  return !!(product.hasOptions || product.allowAcaiAddons || Number(product.freeAddonLimit || 0) > 0);
}

function getBaseCartKey(id) {
  return `p${id}_base`;
}

function getCartItemKey(item) {
  return item.cartKey || getBaseCartKey(item.id);
}

function getItemUnitPrice(item) {
  return Number(item.price || item.unitPrice || item.basePrice || 0);
}

function getItemTotal(item) {
  return getItemUnitPrice(item) * item.qty;
}

function findCartItem(ref) {
  const refStr = String(ref);
  return state.cart.find(i => getCartItemKey(i) === refStr)
    || state.cart.find(i => String(i.id) === refStr);
}

function createCartItem(product, qty = 1, addons = []) {
  const unitPrice = product.price + addons.reduce((sum, addon) => sum + addon.price, 0);
  const addonKey = addons.length
    ? addons.map(addon => `${addon.id}${addon.free ? 'f' : 'p'}`).join('_')
    : 'base';

  return {
    ...product,
    qty,
    basePrice: product.price,
    price: unitPrice,
    addons,
    cartKey: `p${product.id}_${addonKey}`,
  };
}

function getCartQty(id) {
  return state.cart
    .filter(i => i.id === id)
    .reduce((sum, item) => sum + item.qty, 0);
}

function addToCart(id) {
  const product = findProductByAnyId(id);
  if (!product) return;

  if (productNeedsChoice(product)) {
    openProductPage(product.id);
    return;
  }

  const item = createCartItem(product);
  const existing = state.cart.find(i => getCartItemKey(i) === item.cartKey);
  if (existing) {
    existing.qty++;
  } else {
    state.cart.push(item);
  }
  saveCart();
  refreshCartCount();
  updateCartBar();
  refreshProductCard(id);
  renderCartItems();
  showToast(`${product.name} adicionado!`);
}

function changeQty(ref, delta) {
  const item = findCartItem(ref);
  if (!item) return;
  const key = getCartItemKey(item);
  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter(i => getCartItemKey(i) !== key);
  }
  saveCart();
  refreshCartCount();
  updateCartBar();
  refreshProductCard(item.id);
  renderCartItems();
}

function removeFromCart(ref) {
  const item = findCartItem(ref);
  const key = item ? getCartItemKey(item) : String(ref);
  state.cart = state.cart.filter(i => getCartItemKey(i) !== key);
  saveCart();
  refreshCartCount();
  updateCartBar();
  if (item) refreshProductCard(item.id);
  renderCartItems();
}

function getSubtotal() {
  return state.cart.reduce((s, i) => s + getItemTotal(i), 0);
}

function getDeliveryFee() {
  if (state.deliveryType === 'pickup') return 0;
  return calculateDeliveryFeeByKm();
}

function feeDisplay() {
  if (state.deliveryType === 'pickup') return 'Grátis';
  const fee = getDeliveryFee();
  if (state.geo.distanceKm != null) {
    return fee > 0
      ? `R$ ${fmt(fee)} (${state.geo.distanceKm.toFixed(1).replace('.', ',')} km)`
      : 'Grátis';
  }
  return fee > 0 ? `R$ ${fmt(fee)}` : 'Grátis';
}

function getTotal() {
  return Math.max(0, getSubtotal() - state.discount + getDeliveryFee());
}

function saveCart() {
  try { localStorage.setItem('daylanches_cart', JSON.stringify(state.cart)); } catch(e) {}
}

function normalizeCartItem(item) {
  const product = findProductByAnyId(item.id);
  if (!product) return item;

  const addons = (item.addons || []).map(addon => {
    const cfg = ACAI_ADDONS.find(a => a.id === addon.id);
    const basePrice = cfg ? cfg.price : Number(addon.basePrice || addon.price || 0);
    return {
      id: addon.id,
      name: cfg ? cfg.name : addon.name,
      basePrice,
      price: addon.free ? 0 : basePrice,
      free: !!addon.free,
    };
  });

  return createCartItem(product, Number(item.qty || 1), addons);
}

function loadCart() {
  try {
    const saved = localStorage.getItem('daylanches_cart');
    if (saved) state.cart = JSON.parse(saved).map(normalizeCartItem);
  } catch(e) {}
}

/* ──────────────────────────────────────────
   5. RENDERIZAÇÃO DO CARRINHO
────────────────────────────────────────── */
function openCart()  {
  state.cartOpen = true;
  document.getElementById('cart-overlay').classList.add('open');
  document.getElementById('cart-sidebar').classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCartItems();
}

function closeCart() {
  state.cartOpen = false;
  document.getElementById('cart-overlay').classList.remove('open');
  document.getElementById('cart-sidebar').classList.remove('open');
  document.body.style.overflow = '';
}

function buildCartAddonsHTML(item) {
  if (!item.addons || item.addons.length === 0) return '';

  const free = item.addons.filter(addon => addon.free).map(addon => addon.name);
  const paid = item.addons.filter(addon => !addon.free).map(addon => addon.name);
  const rows = [];

  if (free.length) rows.push(`<div class="ci-addons">Adicionais grátis: ${free.join(', ')}</div>`);
  if (paid.length) rows.push(`<div class="ci-addons">Adicionais: ${paid.join(', ')}</div>`);

  return rows.join('');
}

function getAddonGroups(item) {
  const addons = item.addons || [];
  return {
    free: addons.filter(addon => addon.free).map(addon => addon.name),
    paid: addons.filter(addon => !addon.free).map(addon => addon.name),
  };
}

function buildSummaryAddonsHTML(item) {
  const { free, paid } = getAddonGroups(item);
  const rows = [];
  if (free.length) rows.push(`Adicionais grátis: ${free.join(', ')}`);
  if (paid.length) rows.push(`Adicionais: ${paid.join(', ')}`);
  return rows.length ? `<small class="summary-addons">${rows.join('<br>')}</small>` : '';
}

function buildWhatsAppItemText(item) {
  const { free, paid } = getAddonGroups(item);
  let text = `• ${item.qty}x ${item.name} — R$ ${fmt(getItemTotal(item))}`;
  if (free.length) text += `\n  Adicionais grátis: ${free.join(', ')}`;
  if (paid.length) text += `\n  Adicionais: ${paid.join(', ')}`;
  if (item.options?.length) {
    item.options.forEach(og => {
      const parts = (og.items || []).map(i => {
        if (!i.price || i.price === 0 || i.free) return `${i.name} (grátis)`;
        return `${i.name} (+ R$ ${fmt(i.price)})`;
      }).join(', ');
      text += `\n  ${og.groupTitle}: ${parts}`;
    });
  }
  return text;
}

function renderCartItems() {
  const list    = document.getElementById('cart-items-list');
  const empty   = document.getElementById('cart-empty');
  const footer  = document.getElementById('cart-ft');

  if (state.cart.length === 0) {
    empty.style.display = 'flex';
    list.innerHTML = '';
    footer.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  footer.style.display = 'block';

  list.innerHTML = state.cart.map(item => {
    const key = getCartItemKey(item);
    return `
      <div class="cart-item">
        ${item.img
          ? `<img class="ci-img" src="${item.img}" alt="${item.name}" loading="lazy" onerror="this.style.display='none'">`
          : `<div class="ci-img" style="display:flex;align-items:center;justify-content:center;background:#f3f3f3;border-radius:8px"><i class="fas ${item.fallbackIcon || 'fa-utensils'}" style="color:#aaa;font-size:1.3rem"></i></div>`
        }
        <div class="ci-info">
          <div class="ci-name">${item.name}</div>
          <div class="ci-price">R$ ${fmt(getItemUnitPrice(item))}</div>
          ${buildCartOptionsHTML(item)}${buildCartAddonsHTML(item)}
          <div class="ci-controls">
            <button class="ci-btn minus-btn" onclick="changeQty('${key}', -1)" aria-label="Diminuir">
              <i class="fas ${item.qty === 1 ? 'fa-trash' : 'fa-minus'}"></i>
            </button>
            <span class="ci-qty">${item.qty}</span>
            <button class="ci-btn" onclick="changeQty('${key}', 1)" aria-label="Aumentar">
              <i class="fas fa-plus"></i>
            </button>
          </div>
        </div>
        <div class="ci-total">R$ ${fmt(getItemTotal(item))}</div>
      </div>
    `;
  }).join('');

  const sub   = getSubtotal();
  const fee   = getDeliveryFee();
  const total = getTotal();

  document.getElementById('cart-sub').textContent   = `R$ ${fmt(sub)}`;
  document.getElementById('cart-total').textContent = `R$ ${fmt(total)}`;
  const feeTxt = document.getElementById('cart-fee-txt');
  if (feeTxt) feeTxt.textContent = feeDisplay();
}

function refreshCartCount() {
  const total = state.cart.reduce((s, i) => s + i.qty, 0);
  const badge = document.getElementById('cart-count');
  badge.textContent = total;
  badge.style.display = total > 0 ? 'flex' : 'none';
}

function updateCartBar() {
  const bar   = el('cart-bar');
  const waBar = el('wa-bar');
  if (!bar) return;

  const qty      = state.cart.reduce((s, i) => s + i.qty, 0);
  const subtotal = getSubtotal();

  if (qty === 0) {
    bar.style.display = 'none';
    if (waBar) waBar.style.display = 'block';
    return;
  }

  bar.style.display = 'block';
  if (waBar) waBar.style.display = 'none';

  const countEl = el('cart-bar-count');
  const totalEl = el('cart-bar-total');
  if (countEl) countEl.textContent = qty === 1 ? '1 item' : `${qty} itens`;
  if (totalEl) totalEl.textContent = `R$ ${fmt(subtotal)}`;
}

/* ──────────────────────────────────────────
   6. RENDERIZAÇÃO DOS PRODUTOS
────────────────────────────────────────── */
function renderProducts() {
  const grid  = document.getElementById('products-grid');
  const empty = document.getElementById('empty-state');
  const title = document.getElementById('section-title');

  const catLabels = {
    all: '⭐ Destaques do cardápio',
    acai: '🍇 Açaí',
    artesanais: '🥩 Artesanais',
    combos: '🎁 Combos',
    porcoes: '🍟 Porções',
    hamburguer: '🍔 Hambúrguer',
    hotdog: '🌭 Hot Dogs',
    bebidas: '🥤 Bebidas',
    salgadinhos: '🥨 Salgadinhos',
    adicionais: '🍬 Adicionais',
  };

  const q = state.search.toLowerCase().trim();
  const filtered = getProductsList().filter(p => {
    if (p.isAddon) return false;
    const matchCat    = state.cat === 'all' || p.cat === state.cat;
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  if (title) {
    title.innerHTML = q
      ? `<i class="fas fa-search"></i> Resultados para "${state.search}"`
      : `<i class="fas fa-star"></i> ${catLabels[state.cat] || 'Cardápio'}`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = filtered.map(p => buildProductCard(p)).join('');
}

function buildProductControl(p, qty) {
  const pid = p.id;
  if (productNeedsChoice(p)) {
    return `<button class="btn-add" id="ctrl-${pid}" onclick="event.stopPropagation();openProductPage('${pid}')" aria-label="Escolher opções de ${p.name}">
      <i class="fas fa-sliders"></i> Escolher
    </button>`;
  }

  return qty > 0
    ? `<div class="qty-ctrl" id="ctrl-${pid}" onclick="event.stopPropagation()">
        <button class="qty-btn" onclick="changeQty('${pid}',-1)" aria-label="Diminuir"><i class="fas fa-minus"></i></button>
        <span class="qty-val">${qty}</span>
        <button class="qty-btn" onclick="addToCart('${pid}')" aria-label="Aumentar"><i class="fas fa-plus"></i></button>
      </div>`
    : `<button class="btn-add" id="ctrl-${pid}" onclick="event.stopPropagation();addToCart('${pid}')" aria-label="Adicionar ${p.name}">
        <i class="fas fa-cart-plus"></i> Adicionar
      </button>`;
}

function buildProductCard(p) {
  const qty = getCartQty(p.id);
  const badgeMap = {
    mais:  ['badge-mais',  'Mais pedido'],
    novo:  ['badge-novo',  'Novo'],
    combo: ['badge-combo', '3 adicionais grátis'],
    dest:  ['badge-dest',  'Destaque'],
  };
  const badgeHTML = p.badges.length > 0
    ? `<span class="badge ${badgeMap[p.badges[0]][0]}">${badgeMap[p.badges[0]][1]}</span>`
    : '';

  const icon    = p.fallbackIcon || 'fa-utensils';
  const imgHTML = p.img
    ? `<img src="${p.img}" alt="${p.name}" loading="lazy" onerror="handleCardImgError(this,'${icon}')">`
    : `<div class="card-img-placeholder"><i class="fas ${icon}"></i><span>Foto em breve</span></div>`;

  const ctrlHTML = buildProductControl(p, qty);

  return `
    <div class="product-card" data-id="${p.id}" onclick="openProductPage('${p.id}')">
      <div class="card-img-wrap">
        ${imgHTML}
        ${badgeHTML}
      </div>
      <div class="card-body">
        <h3 class="card-name">${p.name}</h3>
        <p class="card-desc">${p.desc}</p>
        <div class="card-footer">
          <span class="card-price">R$ ${fmt(p.price)}</span>
          ${ctrlHTML}
        </div>
      </div>
    </div>`;
}

function refreshProductCard(id) {
  const card = document.querySelector(`.product-card[data-id="${id}"]`);
  if (!card) return;
  const p   = findProductByAnyId(id);
  const qty = getCartQty(id);
  const ctrl = card.querySelector(`#ctrl-${id}`);
  if (!ctrl || !p) return;

  if (productNeedsChoice(p)) {
    ctrl.outerHTML = buildProductControl(p, qty);
    return;
  }

  if (qty > 0) {
    ctrl.outerHTML = `<div class="qty-ctrl" id="ctrl-${id}" onclick="event.stopPropagation()">
      <button class="qty-btn" onclick="changeQty('${id}',-1)" aria-label="Diminuir"><i class="fas fa-minus"></i></button>
      <span class="qty-val">${qty}</span>
      <button class="qty-btn" onclick="addToCart('${id}')" aria-label="Aumentar"><i class="fas fa-plus"></i></button>
    </div>`;
  } else {
    ctrl.outerHTML = `<button class="btn-add" id="ctrl-${id}" onclick="event.stopPropagation();addToCart('${id}')" aria-label="Adicionar">
      <i class="fas fa-cart-plus"></i> Adicionar
    </button>`;
  }
}

/* ──────────────────────────────────────────
   7. FILTROS E BUSCA
────────────────────────────────────────── */
function filterCat(cat, btn) {
  state.cat = cat;
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderProducts();
}

function handleSearch(val) {
  state.search = val;
  renderProducts();
}

/* ──────────────────────────────────────────
   8. CHECKOUT — ENTREGA
────────────────────────────────────────── */
function goToCheckout() {
  if (state.cart.length === 0) {
    showToast('Adicione produtos ao carrinho primeiro');
    return;
  }
  if (!getStoreStatus().isOpen) {
    const modal = el('closed-modal');
    if (modal) modal.style.display = 'flex';
    return;
  }
  closeCart();
  navigateTo('delivery');
}

/* ──────────────────────────────────────────
   Validação de telefone/WhatsApp (BR)
────────────────────────────────────────── */
function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeBrazilPhone(value) {
  let digits = cleanPhone(value);

  if (digits.startsWith("55") && digits.length === 13) {
    return digits;
  }

  if (digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function isValidBrazilMobilePhone(value) {
  let digits = cleanPhone(value);

  if (digits.startsWith("55") && digits.length === 13) {
    digits = digits.slice(2);
  }

  if (digits.length !== 11) return false;

  const validDDDs = new Set([
    "11","12","13","14","15","16","17","18","19",
    "21","22","24","27","28",
    "31","32","33","34","35","37","38",
    "41","42","43","44","45","46","47","48","49",
    "51","53","54","55",
    "61","62","63","64","65","66","67","68","69",
    "71","73","74","75","77","79",
    "81","82","83","84","85","86","87","88","89",
    "91","92","93","94","95","96","97","98","99"
  ]);

  const ddd = digits.slice(0, 2);
  const mobile = digits.slice(2);

  if (!validDDDs.has(ddd)) return false;

  // celular brasileiro precisa começar com 9
  if (!mobile.startsWith("9")) return false;

  // bloqueia todos iguais
  if (/^(\d)\1+$/.test(digits)) return false;
  if (/^(\d)\1+$/.test(mobile)) return false;

  // bloqueia padrões fake comuns
  const fakeNumbers = [
    "999999999",
    "111111111",
    "000000000",
    "123456789",
    "987654321",
    "912345678",
    "998765432"
  ];

  if (fakeNumbers.includes(mobile)) return false;

  return true;
}

function formatPhone(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 11);
  if (v.length > 6) {
    v = '(' + v.substring(0,2) + ') ' + v.substring(2,7) + '-' + v.substring(7);
  } else if (v.length > 2) {
    v = '(' + v.substring(0,2) + ') ' + v.substring(2);
  } else if (v.length > 0) {
    v = '(' + v;
  }
  input.value = v;
  const err = document.getElementById('phone-error');
  if (err) err.style.display = 'none';
}

function goToPayment() {
  const name      = document.getElementById('f-name').value.trim();
  const phoneInput = document.getElementById('f-phone');
  const phone     = phoneInput?.value.trim() || '';
  const errBox    = document.getElementById('delivery-error');
  const phoneErr  = document.getElementById('phone-error');

  errBox.style.display = 'none';
  if (phoneErr) phoneErr.style.display = 'none';

  if (!name) {
    errBox.style.display = 'flex';
    errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  if (!isValidBrazilMobilePhone(phone)) {
    if (phoneErr) {
      phoneErr.style.display = 'flex';
      phoneErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast('Informe um WhatsApp válido com DDD.');
    phoneInput?.focus();
    return;
  }

  if (state.deliveryType === 'delivery' && !state.geo.lat) {
    showToast('Para calcular o frete, permita o acesso à localização.');
    el('btn-geo')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const customerPhone = normalizeBrazilPhone(phone);
  state.form.name    = name;
  state.form.phone   = customerPhone;
  state.form.notes   = el('f-notes')?.value.trim() || '';
  navigateTo('payment');
}

/* ──────────────────────────────────────────
   9. PAGAMENTO
────────────────────────────────────────── */

function updatePaymentPage() {
  const sub  = getSubtotal();
  const fee  = getDeliveryFee();
  const disc = state.discount;
  const tot  = Math.max(0, sub - disc + fee);

  el('pay-subtotal').textContent = `R$ ${fmt(sub)}`;
  el('pay-fee').textContent      = feeDisplay();
  el('pay-total').textContent    = `R$ ${fmt(tot)}`;

  /* Items preview */
  const count = state.cart.reduce((s, i) => s + i.qty, 0);
  const list  = el('pay-items-list');
  if (list) {
    list.innerHTML = `<p class="pay-items-preview">${count} ite${count !== 1 ? 'ns' : 'm'}</p>`;
  }

  /* Endereço / localização */
  const addrTxt = el('pay-address-txt');
  if (state.deliveryType === 'pickup') {
    if (addrTxt) addrTxt.textContent = 'Retirada no local — R. Faustino Martini, 160, Luiz Alves - SC';
  } else if (state.geo.lat) {
    const addrLine = state.geo.address ? `${esc(state.geo.address.replace(/\n/g, ', '))}<br>` : '';
    if (addrTxt) addrTxt.innerHTML = `${addrLine}<a href="${state.geo.link}" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700"><i class="fas fa-location-dot"></i> Abrir no mapa</a>`;
  } else {
    if (addrTxt) addrTxt.textContent = 'Localização não informada';
  }
}

function applyCoupon() {
  const code  = el('coupon-input').value.trim().toUpperCase();
  const msgEl = el('coupon-msg');
  const disc  = VALID_COUPONS[code];

  if (disc) {
    state.discount     = disc;
    state.couponApplied = true;
    msgEl.className    = 'coupon-ok';
    msgEl.innerHTML    = `<i class="fas fa-check-circle"></i> Cupom aplicado! Desconto de R$ ${fmt(disc)}`;
    updatePaymentPage();
  } else {
    state.discount     = 0;
    state.couponApplied = false;
    msgEl.className    = 'coupon-err';
    msgEl.innerHTML    = `<i class="fas fa-times-circle"></i> Cupom inválido`;
  }
}

/* ──────────────────────────────────────────
   10. PAGAMENTO — PIX
────────────────────────────────────────── */
function copyPixKey() {
  navigator.clipboard.writeText(PIX_KEY).catch(() => {});
  const btn = el('btn-copy-pix');
  btn.classList.add('copied');
  btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.innerHTML = '<i class="fas fa-copy"></i> Copiar chave PIX';
  }, 2500);
}

async function sendWhatsAppPixContact() {
  const ok = await sendWhatsApp();
  if (ok) { closePixPage(); navigateTo('confirmation'); }
}

// Futuramente:
// integrar Mercado Pago,
// gerar PIX real,
// receber webhook,
// confirmar pagamento automaticamente,
// e criar painel ADM para acompanhar pedidos.

/* ──────────────────────────────────────────
   12. CONFIRMAÇÃO
────────────────────────────────────────── */
function updateConfirmationPage() {
  el('confirm-num').textContent = `#${state.orderId}`;

  const items = el('confirm-items-list');
  const total = getTotal();
  if (items) {
    items.innerHTML = state.cart.map(i =>
      `<div class="summary-line"><span>${i.qty}x ${i.name}${buildSummaryAddonsHTML(i)}</span><span>R$ ${fmt(getItemTotal(i))}</span></div>`
    ).join('') + `<div class="summary-line"><span>Taxa de entrega</span><span>${feeDisplay()}</span></div>`;
  }
  el('confirm-total-val').textContent = `R$ ${fmt(total)}`;

  const noteEl = el('confirm-pay-note');
  if (noteEl) {
    if (state.payMethod === 'pix') {
      noteEl.innerHTML = '<i class="fas fa-circle-info"></i> Após o pagamento, envie o comprovante pelo WhatsApp.';
      noteEl.className = 'confirm-pay-note confirm-pay-note-pix';
    } else {
      noteEl.innerHTML = '<i class="fas fa-circle-check"></i> A loja irá confirmar seu pedido pelo WhatsApp.';
      noteEl.className = 'confirm-pay-note confirm-pay-note-ok';
    }
  }
}

/* ──────────────────────────────────────────
   13. WHATSAPP
────────────────────────────────────────── */
async function sendWhatsApp() {
  const f     = state.form;
  const troco = state.payMethod === 'cash' ? (el('troco-input')?.value.trim() || '') : '';
  if (troco) state.form.troco = troco;

  const orderData = {
    order_number:    `DL-${state.orderId}`,
    customer_name:   f.name,
    customer_phone:  f.phone || '',
    delivery_type:   state.deliveryType,
    items: state.cart.map(i => ({
      id:             i.id,
      name:           i.name,
      qty:            i.qty,
      unitPrice:      i.basePrice || getItemUnitPrice(i),
      finalUnitPrice: getItemUnitPrice(i),
      options:        i.options || [],
      addons:         i.addons  || [],
      total:          getItemTotal(i),
    })),
    subtotal:        getSubtotal(),
    delivery_fee:    getDeliveryFee(),
    total:           getTotal(),
    payment_method:  state.payMethod,
    payment_status:  state.payMethod === 'pix' ? 'aguardando_comprovante' : 'pagamento_na_entrega',
    notes:           f.notes || '',
    troco:           troco   || null,
    location: state.geo.lat ? {
      lat:         state.geo.lat,
      lng:         state.geo.lon,
      accuracy:    state.geo.accuracy || null,
      mapsLink:    state.geo.link,
      routeLink:   state.geo.routeLink,
      address:     state.geo.address || null,
    } : null,
    customer_address_text: state.geo.address || null,
    status:          'novo',
    whatsapp_opt_in: false,
    whatsapp_sent:   true,
  };

  try {
    await saveOrderToSupabase(orderData);
  } catch (err) {
    console.error('[DayLanches] Erro ao salvar pedido:', err);
    showToast('Não foi possível registrar seu pedido. Tente novamente.');
    return false;
  }

  const payLabels = { pix: 'PIX', card: 'Cartão', cash: 'Dinheiro', online: 'Online', pix_online: 'PIX online', card_online: 'Cartão online' };
  const payNote = {
    pix:  '\nJá vou enviar o comprovante por aqui.',
    card: '\nPagamento no cartão na entrega/retirada.',
    cash: `\nPagamento em dinheiro na entrega/retirada.${troco ? `\nTroco para: R$ ${troco}` : ''}`,
  };

  const message =
    `Olá, fiz meu pedido pelo site da Day Lanches.\n\n` +
    `Pedido: DL-${state.orderId}\n` +
    `Nome: ${f.name}\n` +
    `Total: R$ ${fmt(getTotal())}\n` +
    `Pagamento: ${payLabels[state.payMethod] || state.payMethod}` +
    (payNote[state.payMethod] || '');

  window.open(`https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(message)}`, '_blank');
  return true;
}

/* ──────────────────────────────────────────
   PÁGINA DE DETALHES DO PRODUTO
────────────────────────────────────────── */
let ppProductId = null;
let ppQty = 1;
let ppSelectedAddons = [];
let ppOptionGroups    = [];  /* grupos carregados do Supabase para o produto atual */
let ppOptionSelections = {}; /* {groupId: Set<itemId>} para checkbox | {groupId: itemId} para radio */

const PP_CAT_LABELS = {
  acai: '🍇 Açaí', artesanais: '🥩 Artesanais',
  combos: '🎁 Combos', porcoes: '🍟 Porções',
  hamburguer: '🍔 Hambúrguer', hotdog: '🌭 Hot Dogs',
  bebidas: '🥤 Bebidas', salgadinhos: '🥨 Salgadinhos',
  adicionais: '🍬 Adicionais',
};

function getPpProduct() {
  return getProductsList().find(p => p.id === ppProductId);
}

function ensurePpAddonsSection() {
  let wrap = el('pp-addons-wrap');
  if (wrap) return wrap;

  wrap = document.createElement('div');
  wrap.className = 'pp-addons-wrap';
  wrap.id = 'pp-addons-wrap';
  wrap.style.display = 'none';
  wrap.innerHTML = `
    <div class="pp-addons-head">
      <div>
        <h2>Adicionais</h2>
        <p id="pp-addons-subtitle"></p>
      </div>
      <span id="pp-addons-count"></span>
    </div>
    <div class="pp-addons-list" id="pp-addons-list"></div>
    <div class="pp-addons-note" id="pp-addons-note"></div>
  `;

  const qtyRow = document.querySelector('.pp-qty-row');
  if (qtyRow) qtyRow.insertAdjacentElement('afterend', wrap);
  return wrap;
}

function getPpSelectedAddons(product) {
  const isComboProduct = product?.name === ACAI_COMBO_NAME ||
    product?.id === ACAI_COMBO_PRODUCT_ID ||
    (product?.localId != null && String(product.localId) === String(ACAI_COMBO_PRODUCT_ID));
  const freeLimit = isComboProduct ? ACAI_COMBO_FREE_LIMIT : 0;
  return ppSelectedAddons
    .map((id, index) => {
      const addon = ACAI_ADDONS.find(a => a.id === id);
      if (!addon) return null;
      const free = index < freeLimit;
      return {
        ...addon,
        basePrice: addon.price,
        price: free ? 0 : addon.price,
        free,
      };
    })
    .filter(Boolean);
}

function getPpUnitPrice(product) {
  if (!product) return 0;
  return product.price + getPpSelectedAddons(product).reduce((sum, addon) => sum + addon.price, 0);
}

function updatePpAddButton() {
  const p = getPpProduct();
  const btn = el('pp-add-btn');
  if (!p || !btn) return;
  const baseUnit = ppOptionGroups.length > 0
    ? p.price + getPpOptionsTotal()
    : getPpUnitPrice(p);
  btn.innerHTML = `<i class="fas fa-plus"></i> Adicionar ao carrinho — R$ ${fmt(baseUnit * ppQty)}`;
}

function renderPpAddons(product) {
  const wrap = ensurePpAddonsSection();
  if (!wrap) return;

  if (!isAcaiCustomProduct(product)) {
    wrap.style.display = 'none';
    updatePpAddButton();
    return;
  }

  const isCombo = product.name === ACAI_COMBO_NAME ||
    product.id === ACAI_COMBO_PRODUCT_ID ||
    (product.localId != null && String(product.localId) === String(ACAI_COMBO_PRODUCT_ID));
  const selectedAddons = getPpSelectedAddons(product);
  const freeCount = selectedAddons.filter(addon => addon.free).length;
  const paidCount = selectedAddons.length - freeCount;

  wrap.style.display = 'flex';
  el('pp-addons-subtitle').textContent = isCombo
    ? 'Escolha até 3 adicionais grátis. Seleções extras são cobradas.'
    : 'Monte seu açaí com os adicionais que quiser.';
  el('pp-addons-count').textContent = isCombo
    ? `${freeCount}/${ACAI_COMBO_FREE_LIMIT} grátis`
    : `${selectedAddons.length} selecionado${selectedAddons.length === 1 ? '' : 's'}`;

  el('pp-addons-list').innerHTML = ACAI_ADDONS.map(addon => {
    const selectedIndex = ppSelectedAddons.indexOf(addon.id);
    const selected = selectedIndex !== -1;
    const free = isCombo && selected && selectedIndex < ACAI_COMBO_FREE_LIMIT;
    const priceLabel = free ? 'Grátis' : `R$ ${fmt(addon.price)}`;
    return `
      <button
        type="button"
        class="pp-addon${selected ? ' selected' : ''}"
        onclick="ppToggleAddon('${addon.id}')"
        aria-pressed="${selected ? 'true' : 'false'}"
      >
        <span class="pp-addon-check"><i class="fas fa-check"></i></span>
        <span class="pp-addon-name">${addon.name}</span>
        <span class="pp-addon-price">${priceLabel}</span>
      </button>
    `;
  }).join('');

  const note = el('pp-addons-note');
  if (note) {
    if (isCombo && selectedAddons.length > ACAI_COMBO_FREE_LIMIT) {
      note.textContent = `${freeCount} adicionais grátis e ${paidCount} adicional${paidCount === 1 ? '' : 'is'} cobrado${paidCount === 1 ? '' : 's'} no total.`;
    } else if (isCombo) {
      note.textContent = 'Os 3 primeiros adicionais selecionados não alteram o preço do combo.';
    } else {
      const addTotal = selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
      note.textContent = addTotal > 0 ? `Adicionais somam R$ ${fmt(addTotal)} ao produto.` : 'Selecione para adicionar ao seu açaí.';
    }
  }

  updatePpAddButton();
}

function ppToggleAddon(addonId) {
  const idx = ppSelectedAddons.indexOf(addonId);
  if (idx === -1) {
    ppSelectedAddons.push(addonId);
  } else {
    ppSelectedAddons.splice(idx, 1);
  }
  renderPpAddons(getPpProduct());
}

/* ── Opções de produto (DB-driven) ── */
async function loadProductOptions(productId) {
  ppOptionGroups     = [];
  ppOptionSelections = {};
  try {
    const db = getSb();
    if (!db || !productId) return;

    console.log('[DayLanches] Buscando opções para product.id:', productId);

    /* Query 1: grupos ativos do produto */
    const { data: groups, error: gErr } = await db
      .from('product_option_groups')
      .select('*')
      .eq('product_id', productId)
      .eq('active', true)
      .order('display_order', { ascending: true });

    if (gErr) { console.error('[DayLanches] Erro ao carregar grupos de opções:', gErr); return; }
    if (!groups?.length) { console.log('[DayLanches] Nenhum grupo encontrado para', productId); return; }

    console.log('[DayLanches] Grupos carregados:', groups.length);

    /* Query 2: itens ativos dos grupos encontrados */
    const groupIds = groups.map(g => g.id);
    const { data: items, error: iErr } = await db
      .from('product_option_items')
      .select('*')
      .in('group_id', groupIds)
      .eq('active', true)
      .order('display_order', { ascending: true });

    if (iErr) { console.error('[DayLanches] Erro ao carregar itens de opções:', iErr); return; }

    console.log('[DayLanches] Itens carregados:', items?.length ?? 0);

    ppOptionGroups = groups.map(g => ({
      id:         g.id,
      title:      g.title,
      type:       g.type || 'checkbox',
      required:   !!g.required,
      max_select: Number(g.max_select || 0),
      free_limit: Number(g.free_limit || 0),
      items:      (items || [])
        .filter(i => i.group_id === g.id)
        .map(i => ({ id: i.id, name: i.name, price_delta: Number(i.price_delta || 0) })),
    }));

    ppOptionGroups.forEach(g => {
      ppOptionSelections[g.id] = g.type === 'radio' ? null : new Set();
    });

    console.log('[DayLanches] Opções processadas:', ppOptionGroups);
  } catch(e) { console.warn('[DayLanches] Erro ao carregar opções:', e); }
}

function renderProductOptions(product) {
  /* Remove seção anterior de opções (se existir) */
  const oldOpts = el('pp-options-wrap');
  if (oldOpts) oldOpts.remove();

  /* Oculta sistema antigo de açaí */
  const oldAddons = el('pp-addons-wrap');

  /* Sem grupos: cai no sistema antigo (açaí hardcoded) ou sai */
  if (!ppOptionGroups.length) {
    if (isAcaiCustomProduct(product)) {
      if (oldAddons) oldAddons.style.display = '';
      renderPpAddons(product);
    } else {
      if (oldAddons) oldAddons.style.display = 'none';
    }
    updatePpAddButton();
    return;
  }

  if (oldAddons) oldAddons.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.id        = 'pp-options-wrap';
  wrap.className = 'pp-options-wrap';

  try {
    wrap.innerHTML = ppOptionGroups.map(group => {
      const gid = esc(group.id);
      return `
        <div class="pp-opt-group">
          <div class="pp-opt-group-hd">
            <h3 class="pp-opt-group-title">${esc(group.title)}</h3>
            <div style="display:flex;align-items:center;gap:6px">
              ${group.required ? '<span class="pp-opt-badge pp-opt-badge-req">Obrigatório</span>' : ''}
              ${group.free_limit > 0 ? `<span class="pp-opt-badge pp-opt-badge-free">${group.free_limit} grátis</span>` : ''}
              <span class="pp-opt-count" id="pp-opt-cnt-${gid}"></span>
            </div>
          </div>
          <div class="pp-opt-items">
            ${group.items.map(item => {
              const iid = esc(item.id);
              return `
                <label class="pp-opt-item" id="pp-opt-lbl-${gid}-${iid}" onclick="event.preventDefault();ppToggleOption('${gid}','${iid}')">
                  <input type="${group.type === 'radio' ? 'radio' : 'checkbox'}"
                    name="ppopt_${gid}" value="${iid}"
                    class="pp-opt-inp"
                    onclick="event.preventDefault()">
                  <div class="pp-opt-left">
                    <span class="pp-opt-fake-check" id="pp-opt-fk-${gid}-${iid}"></span>
                    <span class="pp-opt-name">${esc(item.name)}</span>
                  </div>
                  <span class="${item.price_delta > 0 ? 'pp-opt-price' : 'pp-opt-price-free'}">
                    ${item.price_delta > 0 ? `+ R$ ${fmt(item.price_delta)}` : 'Grátis'}
                  </span>
                </label>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');
  } catch(e) {
    console.error('[DayLanches] Erro ao renderizar opções:', e);
    return;
  }

  /* Inserir entre pp-qty-row e pp-obs-wrap */
  const qtyRow = document.querySelector('.pp-qty-row');
  const obsWrap = document.querySelector('.pp-obs-wrap');
  if (obsWrap) {
    obsWrap.insertAdjacentElement('beforebegin', wrap);
  } else if (qtyRow) {
    qtyRow.insertAdjacentElement('afterend', wrap);
  } else {
    const body = el('product-page')?.querySelector('.pp-body');
    if (body) body.insertBefore(wrap, body.firstChild);
  }

  updatePpAddButton();
}

function ppToggleOption(groupId, itemId) {
  const group = ppOptionGroups.find(g => g.id === groupId);
  if (!group) return;

  if (group.type === 'radio') {
    const current = ppOptionSelections[groupId];
    if (current === itemId && !group.required) {
      /* Deselect: radio opcional clicado novamente */
      ppOptionSelections[groupId] = null;
      group.items.forEach(item => {
        const inp = document.querySelector(`input[name="ppopt_${groupId}"][value="${item.id}"]`);
        if (inp) inp.checked = false;
      });
    } else {
      ppOptionSelections[groupId] = itemId;
      group.items.forEach(item => {
        const inp = document.querySelector(`input[name="ppopt_${groupId}"][value="${item.id}"]`);
        if (inp) inp.checked = item.id === itemId;
      });
    }
  } else {
    /* Checkbox */
    if (!(ppOptionSelections[groupId] instanceof Set)) ppOptionSelections[groupId] = new Set();
    const s = ppOptionSelections[groupId];

    if (s.has(itemId)) {
      s.delete(itemId);
    } else {
      if (group.max_select > 0 && s.size >= group.max_select) {
        showToast(`Máximo de ${group.max_select} ${group.max_select === 1 ? 'opção' : 'opções'} para "${group.title}".`);
        return;
      }
      s.add(itemId);
    }

    const inp = document.querySelector(`input[name="ppopt_${groupId}"][value="${itemId}"]`);
    if (inp) inp.checked = s.has(itemId);

    /* Atualiza contador — só itens pagos consomem o free_limit */
    const countEl = el(`pp-opt-cnt-${groupId}`);
    if (countEl) {
      const n  = s.size;
      const fl = Number(group.free_limit || 0);
      if (n === 0) {
        countEl.textContent = '';
      } else if (fl > 0) {
        const paidCount = [...s].filter(id => {
          const it = group.items.find(i => i.id === id);
          return it && it.price_delta > 0;
        }).length;
        const freeUsed = Math.min(paidCount, fl);
        const charged  = Math.max(0, paidCount - fl);
        countEl.textContent = charged > 0
          ? `${freeUsed} grátis + ${charged} cobrado${charged > 1 ? 's' : ''}`
          : `${freeUsed} grátis`;
      } else {
        countEl.textContent = `${n} selecionado${n > 1 ? 's' : ''}`;
      }
    }
  }

  ppSyncVisuals(groupId);
  updatePpAddButton();
}

function ppSyncVisuals(groupId) {
  const group = ppOptionGroups.find(g => g.id === groupId);
  if (!group) return;
  const sel = ppOptionSelections[groupId];
  group.items.forEach(item => {
    const isSelected = group.type === 'radio'
      ? sel === item.id
      : (sel instanceof Set && sel.has(item.id));
    const lbl = document.getElementById(`pp-opt-lbl-${groupId}-${item.id}`);
    const fk  = document.getElementById(`pp-opt-fk-${groupId}-${item.id}`);
    if (lbl) lbl.classList.toggle('selected', isSelected);
    if (fk)  fk.classList.toggle('checked', isSelected);
  });
}

/* Mantido para compatibilidade — não mais chamado pelo template */
function ppHandleOptionChange(groupId, itemId) {
  ppToggleOption(groupId, itemId);
}

function getPpOptionsTotal() {
  let extra = 0;
  for (const group of ppOptionGroups) {
    const sel = ppOptionSelections[group.id];
    const fl  = Number(group.free_limit || 0);
    if (group.type === 'radio') {
      const item = group.items.find(i => i.id === sel);
      if (item) extra += item.price_delta;
    } else if (sel instanceof Set) {
      const selected = [...sel].map(id => group.items.find(i => i.id === id)).filter(Boolean);
      /* Opções com preço 0 são sempre grátis e NÃO consomem o free_limit */
      const paidSelected = selected.filter(i => i.price_delta > 0);
      paidSelected.forEach((item, idx) => {
        /* As primeiras fl opções pagas são grátis */
        if (fl > 0 && idx < fl) return;
        extra += item.price_delta;
      });
    }
  }
  return extra;
}

function getPpOptionsForCart() {
  const result = [];
  for (const group of ppOptionGroups) {
    const sel = ppOptionSelections[group.id];
    const fl  = Number(group.free_limit || 0);
    const chosen = [];
    if (group.type === 'radio') {
      const item = group.items.find(i => i.id === sel);
      if (item) chosen.push({ name:item.name, price:item.price_delta, free:item.price_delta <= 0 });
    } else if (sel instanceof Set) {
      const selected = [...sel].map(id => group.items.find(i => i.id === id)).filter(Boolean);
      /* Separar: preço 0 (sempre grátis) e preço > 0 (pode usar free_limit) */
      const nativeFree = selected.filter(i => i.price_delta <= 0);
      const paidItems  = selected.filter(i => i.price_delta > 0);

      nativeFree.forEach(item => {
        chosen.push({ name:item.name, price:0, free:true });
      });
      paidItems.forEach((item, idx) => {
        const freeByLimit = fl > 0 && idx < fl;
        chosen.push({ name:item.name, price:freeByLimit ? 0 : item.price_delta, free:freeByLimit });
      });
    }
    if (chosen.length) result.push({ groupTitle:group.title, items:chosen });
  }
  return result;
}

function buildCartOptionsHTML(item) {
  if (!item.options?.length) return '';
  return item.options.map(og => {
    const parts = (og.items || []).map(i => {
      if (!i.price || i.price === 0 || i.free) return i.name;
      return `${i.name} (+ R$ ${fmt(i.price)})`;
    }).join(', ');
    return `<div class="ci-addons">${esc(og.groupTitle)}: ${esc(parts)}</div>`;
  }).join('');
}

function openProductPage(id) {
  const p = findProductByAnyId(id);
  if (!p) return;
  ppProductId = p.id;
  ppQty = 1;
  ppSelectedAddons  = [];
  ppOptionGroups    = [];
  ppOptionSelections = {};

  /* Imagem */
  const hero = el('pp-hero');
  const existingMedia = hero.querySelector('.pp-hero-img, .pp-hero-placeholder');
  if (existingMedia) existingMedia.remove();

  if (p.img) {
    const img = document.createElement('img');
    img.className = 'pp-hero-img';
    img.src = p.img;
    img.alt = p.name;
    hero.insertBefore(img, hero.firstChild);
  } else {
    const ph = document.createElement('div');
    ph.className = 'pp-hero-placeholder';
    ph.innerHTML = `<i class="fas ${p.fallbackIcon || 'fa-utensils'}"></i>`;
    hero.insertBefore(ph, hero.firstChild);
  }

  /* Badge */
  const badgeMap = { mais: ['badge-mais','Mais pedido'], novo: ['badge-novo','Novo'], combo: ['badge-combo','3 adicionais grátis'], dest: ['badge-dest','Destaque'] };
  const slot = el('pp-badge-slot');
  if (slot) slot.innerHTML = p.badges.length ? `<span class="badge ${badgeMap[p.badges[0]][0]}">${badgeMap[p.badges[0]][1]}</span>` : '';

  /* Textos */
  el('pp-name').textContent  = p.name;
  el('pp-price').textContent = `R$ ${fmt(p.price)}`;
  el('pp-desc').textContent  = p.desc;
  el('pp-cat-tag').textContent = PP_CAT_LABELS[p.cat] || p.cat;
  el('pp-qty-val').textContent = ppQty;

  /* Obs */
  const obs = el('pp-obs');
  if (obs) obs.value = '';

  const page = el('product-page');
  if (page) { page.classList.add('open'); document.body.style.overflow = 'hidden'; }

  /* Carrega opções do banco de forma assíncrona */
  console.log('[DayLanches] Produto aberto:', p.name, '| id:', p.id);
  loadProductOptions(p.id)
    .then(() => renderProductOptions(p))
    .catch(e => console.error('[DayLanches] Falha ao carregar opções:', e));
}

function closeProductPage() {
  const page = el('product-page');
  if (page) page.classList.remove('open');
  if (!state.cartOpen && !spOpen) document.body.style.overflow = '';
  ppProductId       = null;
  ppSelectedAddons  = [];
  ppOptionGroups    = [];
  ppOptionSelections = {};
  if (window.location.search.includes('produto')) {
    window.history.replaceState({}, '', window.location.pathname);
  }
}

/* ──────────────────────────────────────────
   COMPARTILHAMENTO DE PRODUTOS
────────────────────────────────────────── */
const SITE_URL = 'https://www.daylanches.com.br';

function slugify(text) {
  return text.toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function getProductShareUrl(product) {
  const slug = product.slug || slugify(product.name);
  return `${SITE_URL}/share/${slug}.html`;
}

function shareProductWhatsApp() {
  if (!ppProductId) return;
  const p = getProductsList().find(pr => pr.id === ppProductId);
  if (!p) return;
  const url     = getProductShareUrl(p);
  const message =
    `🔥 Olha esse produto da Day Lanches!\n\n` +
    `🍔 *${p.name}*\n` +
    `💰 R$ ${fmt(p.price)}\n\n` +
    `Peça pelo cardápio online:\n${url}\n\n` +
    `📍 Day Lanches — Luiz Alves/SC`;
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
}

async function shareProduct() {
  if (!ppProductId) return;
  const p = getProductsList().find(pr => pr.id === ppProductId);
  if (!p) return;
  const url       = getProductShareUrl(p);
  const shareText = `🔥 ${p.name} na Day Lanches por R$ ${fmt(p.price)}! Peça pelo cardápio online.`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `${p.name} — Day Lanches`, text: shareText, url });
    } catch (_) { /* cancelado pelo usuário */ }
  } else {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${url}`);
      showToast('Link do produto copiado!');
    } catch (_) {
      showToast('Copie o link: ' + url);
    }
  }
}

function ppChangeQty(delta) {
  ppQty = Math.max(1, ppQty + delta);
  el('pp-qty-val').textContent = ppQty;
  updatePpAddButton();
}

function ppAddToCart() {
  if (!ppProductId) return;
  const p = getPpProduct();
  if (!p) return;

  /* Validar opções obrigatórias */
  if (ppOptionGroups.length > 0) {
    for (const group of ppOptionGroups) {
      const sel = ppOptionSelections[group.id];
      const count = group.type === 'radio'
        ? (sel ? 1 : 0)
        : (sel instanceof Set ? sel.size : 0);

      if (group.required && count === 0) {
        showToast(`Escolha uma opção em: "${group.title}"`);
        return;
      }
      if (group.max_select > 0 && count > group.max_select) {
        showToast(`Máximo de ${group.max_select} opções em: "${group.title}"`);
        return;
      }
    }
  }

  let item;

  if (ppOptionGroups.length > 0) {
    /* Sistema novo: opções do banco */
    const options    = getPpOptionsForCart();
    const optExtra   = getPpOptionsTotal();
    const unitPrice  = p.price + optExtra;
    const optKey     = options.map(og => og.items.map(i=>i.name).join('+')).join('|') || 'base';
    const cartKey    = `p${p.id}_${optKey}`;
    item = { ...p, qty:ppQty, basePrice:p.price, price:unitPrice, addons:[], options, cartKey };
  } else {
    /* Sistema antigo: adicionais açaí */
    item = createCartItem(p, ppQty, getPpSelectedAddons(p));
  }

  const existing = state.cart.find(c => getCartItemKey(c) === item.cartKey);
  if (existing) {
    existing.qty += ppQty;
  } else {
    state.cart.push(item);
  }

  saveCart();
  refreshCartCount();
  updateCartBar();
  refreshProductCard(ppProductId);
  renderCartItems();

  const obs = el('pp-obs')?.value.trim();
  showToast(obs ? `${p.name} adicionado! (${obs})` : `${p.name} adicionado!`);
  closeProductPage();
}

/* ──────────────────────────────────────────
   TELA DE PESQUISA
────────────────────────────────────────── */
const SP_SUGGEST_IDS = [8, 2, 15, 16]; /* Burguer Duplo, Açaí 500ml, Fritas Bacon, Coca-Cola */

let spOpen = false;

function openSearchPage() {
  const page = el('search-page');
  if (!page) return;
  page.classList.add('open');
  spOpen = true;
  document.body.style.overflow = 'hidden';
  renderSpHistory();
  renderSpSuggestions();
  setTimeout(() => { el('sp-input')?.focus(); }, 320);
}

function closeSearchPage() {
  const page = el('search-page');
  if (!page) return;
  page.classList.remove('open');
  spOpen = false;
  if (!state.cartOpen) document.body.style.overflow = '';
  /* Limpa estado interno */
  const inp = el('sp-input');
  if (inp) inp.value = '';
  el('sp-body').style.display    = '';
  el('sp-results').style.display = 'none';
  el('sp-clear-btn').style.display = 'none';
}

function handleSearchPage(val) {
  el('sp-clear-btn').style.display = val ? 'flex' : 'none';
  if (val.trim()) {
    el('sp-body').style.display    = 'none';
    el('sp-results').style.display = '';
    renderSpResults(val.trim());
  } else {
    el('sp-body').style.display    = '';
    el('sp-results').style.display = 'none';
  }
}

function handleSearchPageKey(e) {
  if (e.key === 'Enter') {
    const val = el('sp-input')?.value.trim();
    if (val) saveSpHistory(val);
  }
}

function clearSpInput() {
  const inp = el('sp-input');
  if (inp) { inp.value = ''; inp.focus(); }
  handleSearchPage('');
}

/* ── Histórico ── */
function getSpHistory() {
  try { return JSON.parse(localStorage.getItem('dl_search_hist') || '[]'); } catch(e) { return []; }
}

function saveSpHistory(term) {
  if (!term) return;
  let h = getSpHistory().filter(t => t.toLowerCase() !== term.toLowerCase());
  h.unshift(term);
  if (h.length > 5) h = h.slice(0, 5);
  try { localStorage.setItem('dl_search_hist', JSON.stringify(h)); } catch(e) {}
  renderSpHistory();
}

function clearSearchHistory() {
  try { localStorage.removeItem('dl_search_hist'); } catch(e) {}
  renderSpHistory();
}

function removeSpHistItem(term) {
  const h = getSpHistory().filter(t => t !== term);
  try { localStorage.setItem('dl_search_hist', JSON.stringify(h)); } catch(e) {}
  renderSpHistory();
}

function applySpHistory(term) {
  const inp = el('sp-input');
  if (inp) { inp.value = term; inp.focus(); }
  handleSearchPage(term);
}

function renderSpHistory() {
  const sec  = el('sp-history-section');
  const list = el('sp-history-list');
  if (!sec || !list) return;
  const h = getSpHistory();
  if (!h.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  list.innerHTML = h.map(term => `
    <div class="sp-history-item" onclick="applySpHistory('${term.replace(/'/g,"\\'")}')">
      <i class="fas fa-clock sp-hist-ico"></i>
      <span class="sp-hist-term">${term}</span>
      <button class="sp-hist-remove" onclick="event.stopPropagation();removeSpHistItem('${term.replace(/'/g,"\\'")}')">
        <i class="fas fa-times"></i>
      </button>
    </div>`).join('');
}

/* ── Sugestões ── */
function renderSpSuggestions() {
  const grid = el('sp-suggest-grid');
  if (!grid) return;
  const items = SP_SUGGEST_IDS.map(id => findProductByAnyId(id)).filter(Boolean);
  grid.innerHTML = items.map(p => {
    const imgH = p.img
      ? `<img class="sp-suggest-img" src="${p.img}" alt="${p.name}" loading="lazy">`
      : `<div class="sp-suggest-placeholder"><i class="fas ${p.fallbackIcon||'fa-utensils'}"></i></div>`;
    return `
      <div class="sp-suggest-card" onclick="spSelectProduct('${p.id}')">
        ${imgH}
        <div class="sp-suggest-info">
          <div class="sp-suggest-name">${p.name}</div>
          <div class="sp-suggest-price">R$ ${fmt(p.price)}</div>
        </div>
      </div>`;
  }).join('');
}

/* ── Resultados — mesmo card do catálogo ── */
function buildSpResultCard(p) {
  const icon    = p.fallbackIcon || 'fa-utensils';
  const safeN   = p.name.replace(/'/g, "\\'");
  const imgHTML = p.img
    ? `<img src="${p.img}" alt="${p.name}" loading="lazy" onerror="handleCardImgError(this,'${icon}')">`
    : `<div class="card-img-placeholder"><i class="fas ${icon}"></i></div>`;
  const btnHTML = productNeedsChoice(p)
    ? `<button class="btn-add" onclick="event.stopPropagation();spChooseProduct('${p.id}')" aria-label="Escolher opções">
        <i class="fas fa-sliders"></i> Escolher
      </button>`
    : `<button class="btn-add" onclick="event.stopPropagation();addToCart('${p.id}');showToast('${safeN} adicionado!')" aria-label="Adicionar">
        <i class="fas fa-cart-plus"></i> Adicionar
      </button>`;

  return `
    <div class="product-card" onclick="spSelectProduct('${p.id}')">
      <div class="card-img-wrap">${imgHTML}</div>
      <div class="card-body">
        <h3 class="card-name">${p.name}</h3>
        <p class="card-desc">${p.desc}</p>
        <div class="card-footer">
          <span class="card-price">R$ ${fmt(p.price)}</span>
          ${btnHTML}
        </div>
      </div>
    </div>`;
}

function renderSpResults(q) {
  const list  = el('sp-results-list');
  const noRes = el('sp-no-results');
  if (!list || !noRes) return;
  const ql = q.toLowerCase();
  const filtered = getProductsList().filter(p =>
    !p.isAddon && (p.name.toLowerCase().includes(ql) || p.desc.toLowerCase().includes(ql))
  );
  if (!filtered.length) {
    list.innerHTML = '';
    noRes.style.display = 'block';
    return;
  }
  noRes.style.display = 'none';
  list.innerHTML = filtered.map(p => buildSpResultCard(p)).join('');
}

/* ── Ações ── */
function searchGoCategory(cat) {
  closeSearchPage();
  setTimeout(() => {
    state.cat    = cat;
    state.search = '';
    document.querySelectorAll('.cat-chip').forEach(c =>
      c.classList.toggle('active', !!c.getAttribute('onclick')?.includes(`'${cat}'`))
    );
    const sinp = el('search-input');
    if (sinp) sinp.value = '';
    renderProducts();
    setTimeout(() => el('products-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, 320);
}

function spSelectProduct(id) {
  const term = el('sp-input')?.value.trim();
  if (term) saveSpHistory(term);
  closeSearchPage();
  setTimeout(() => {
    const p = findProductByAnyId(id);
    scrollToCategory(p ? p.cat : 'all', p ? p.id : id);
  }, 320);
}

function spChooseProduct(id) {
  const term = el('sp-input')?.value.trim();
  if (term) saveSpHistory(term);
  closeSearchPage();
  setTimeout(() => openProductPage(id), 320);
}

/* ──────────────────────────────────────────
   CARROSSEL DE DESTAQUES
────────────────────────────────────────── */
const CAROUSEL_IDS = [2, 3, 8, 11, 15, 16];

const CAROUSEL_BADGE_MAP = {
  2:  { badge: 'mais',  label: 'Mais pedido' },
  3:  { badge: 'combo', label: '3 adicionais grátis' },
  8:  { badge: 'promo', label: 'Promoção' },
  11: { badge: 'dest',  label: 'Destaque' },
  15: { badge: 'dest',  label: 'Destaque' },
  16: { badge: 'novo',  label: 'Novo' },
};

const CAROUSEL_CAT_MAP = {
  2:  'acai',
  3:  'acai',
  8:  'hamburguer',
  11: 'artesanais',
  15: 'porcoes',
  16: 'bebidas',
};

const carousel = {
  index:    0,
  total:    CAROUSEL_IDS.length,
  timer:    null,
  dragging: false,
  startX:   0,
};

function initCarousel() {
  const track  = el('carousel-track');
  const dotsEl = el('carousel-dots');
  if (!track || !dotsEl) {
    setTimeout(initCarousel, 200);
    return;
  }

  const heroList = getHeroProducts();
  const slides = heroList.map(p => {
    const meta = CAROUSEL_BADGE_MAP[p.localId] || CAROUSEL_BADGE_MAP[p.id] || {};
    const badge = meta.badge || p.badges?.[0] || 'novo';
    const label = meta.label || (p.badges?.[0] ? { mais:'Mais pedido', dest:'Destaque', novo:'Novo', combo:'3 adicionais grátis' }[p.badges[0]] || '' : '');
    return { ...p, cBadge: badge, cLabel: label };
  });

  if (!slides.length) {
    track.innerHTML = `<div class="carousel-slide">
      <div class="slide-banner" style="background:var(--primary)">
        <div class="slide-banner-overlay"></div>
        <div class="slide-banner-content">
          <h2 class="slide-name">Day Lanches</h2>
          <div class="slide-price">Seu lanche favorito em poucos cliques</div>
        </div>
      </div>
    </div>`;
    dotsEl.innerHTML = '';
    carousel.total = 1;
    setupCarouselTouch();
    return;
  }

  carousel.total   = slides.length;
  track.innerHTML  = slides.map(p => buildCarouselSlide(p)).join('');
  dotsEl.innerHTML = slides.map((_, i) =>
    `<button class="carousel-dot${i === 0 ? ' active' : ''}" onclick="goToSlide(${i})" aria-label="Slide ${i + 1}"></button>`
  ).join('');

  setupCarouselTouch();
  carousel.timer = setInterval(autoNextSlide, 3500);
}

function buildCarouselSlide(p) {
  const cat     = p.cat || CAROUSEL_CAT_MAP[p.localId] || CAROUSEL_CAT_MAP[p.id] || 'all';
  const imgHTML = p.img
    ? `<img class="slide-banner-img" src="${p.img}" alt="${p.name}" loading="eager">`
    : `<div class="slide-banner-placeholder"><i class="fas ${p.fallbackIcon || 'fa-utensils'}"></i></div>`;

  return `
    <div class="carousel-slide" onclick="scrollToCategory('${cat}', '${p.id}')" role="button" tabindex="0" aria-label="${p.name}">
      <div class="slide-banner">
        ${imgHTML}
        <div class="slide-banner-overlay"></div>
        <div class="slide-banner-content">
          <span class="slide-badge slide-badge-${p.cBadge}">${p.cLabel}</span>
          <h2 class="slide-name">${p.name}</h2>
          <div class="slide-price">R$ ${fmt(p.price)}</div>
          <p class="slide-desc">${p.desc}</p>
        </div>
      </div>
    </div>`;
}

function goToSlide(index) {
  const track = el('carousel-track');
  const dots  = document.querySelectorAll('.carousel-dot');
  if (!track) return;
  carousel.index = ((index % carousel.total) + carousel.total) % carousel.total;
  track.style.transform = `translateX(-${carousel.index * 100}%)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === carousel.index));
}

function nextSlide() {
  clearInterval(carousel.timer);
  goToSlide(carousel.index + 1);
  carousel.timer = setInterval(autoNextSlide, 3500);
}

function prevSlide() {
  clearInterval(carousel.timer);
  goToSlide(carousel.index - 1);
  carousel.timer = setInterval(autoNextSlide, 3500);
}

function autoNextSlide() {
  goToSlide(carousel.index + 1);
}

function setupCarouselTouch() {
  const wrap = el('carousel-track-wrap');
  if (!wrap) return;

  /* Touch (mobile) */
  wrap.addEventListener('touchstart', e => {
    carousel.startX   = e.touches[0].clientX;
    carousel.dragging = true;
  }, { passive: true });

  wrap.addEventListener('touchend', e => {
    if (!carousel.dragging) return;
    const diff = carousel.startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) { diff > 0 ? nextSlide() : prevSlide(); }
    carousel.dragging = false;
  }, { passive: true });

  /* Mouse drag (desktop) */
  wrap.addEventListener('mousedown', e => {
    carousel.startX   = e.clientX;
    carousel.dragging = true;
    e.preventDefault();
  });
  wrap.addEventListener('mouseup', e => {
    if (!carousel.dragging) return;
    const diff = carousel.startX - e.clientX;
    if (Math.abs(diff) > 40) { diff > 0 ? nextSlide() : prevSlide(); }
    carousel.dragging = false;
  });
  wrap.addEventListener('mouseleave', () => { carousel.dragging = false; });
}

function scrollToCategory(cat, productId) {
  state.cat    = cat;
  state.search = '';

  document.querySelectorAll('.cat-chip').forEach(chip => {
    const matches = chip.getAttribute('onclick')?.includes(`'${cat}'`);
    chip.classList.toggle('active', !!matches);
  });

  const searchEl = el('search-input');
  if (searchEl) searchEl.value = '';

  renderProducts();

  setTimeout(() => {
    const card   = document.querySelector(`.product-card[data-id="${productId}"]`);
    const target = card || el('products-grid');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (card) {
        card.style.outline = '3px solid var(--primary)';
        setTimeout(() => { card.style.outline = ''; }, 1800);
      }
    }
  }, 120);
}

/* ──────────────────────────────────────────
   14. TOAST
────────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ──────────────────────────────────────────
   15. UTILIDADES
────────────────────────────────────────── */
function fmt(n) {
  return Number(n).toFixed(2).replace('.', ',');
}
function el(id) {
  return document.getElementById(id);
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* ──────────────────────────────────────────
   HORÁRIO DE ATENDIMENTO
────────────────────────────────────────── */
const WEEKDAY_NAMES = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const MONDAY_FIRST_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DAY_TOKEN_MAP = {
  dom: 0, domingo: 0,
  seg: 1, segunda: 1,
  ter: 2, terca: 2,
  qua: 3, quarta: 3,
  qui: 4, quinta: 4,
  sex: 5, sexta: 5,
  sab: 6, sabado: 6,
};

/* Usado apenas se store_settings não tiver nenhum horário salvo/interpretável */
const FALLBACK_SCHEDULE_TEXT = 'Quinta a domingo 17:30 às 23:00';

let storeConfig = null;

function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* Converte um trecho como "terça", "segunda a sexta", "sábado e domingo" ou
   "todos os dias" em uma lista de índices de dia (0=domingo ... 6=sábado). */
function parseDayTokens(daysPart) {
  const part = daysPart.trim();
  if (!part) return null;
  if (/\btodos?\b/.test(part)) return [0, 1, 2, 3, 4, 5, 6];

  const firstWord = s => s.trim().split(/\s+/)[0];

  if (/\ba\b/.test(part)) {
    const pieces = part.split(/\ba\b/).map(s => s.trim()).filter(Boolean);
    if (pieces.length === 2) {
      const start = DAY_TOKEN_MAP[firstWord(pieces[0])];
      const end   = DAY_TOKEN_MAP[firstWord(pieces[1])];
      if (start != null && end != null) {
        const days = [];
        let d = start;
        for (let i = 0; i < 7; i++) {
          days.push(d);
          if (d === end) break;
          d = (d + 1) % 7;
        }
        return days;
      }
    }
  }

  if (/\be\b/.test(part)) {
    const pieces = part.split(/\be\b/).map(s => s.trim()).filter(Boolean);
    const days = pieces.map(p => DAY_TOKEN_MAP[firstWord(p)]).filter(d => d != null);
    if (days.length) return days;
  }

  /* Compatibilidade com formatos abreviados como "qui-dom" ou "qua-dom" */
  if (/-/.test(part)) {
    const pieces = part.split('-').map(s => s.trim()).filter(Boolean);
    if (pieces.length === 2) {
      const start = DAY_TOKEN_MAP[firstWord(pieces[0])];
      const end   = DAY_TOKEN_MAP[firstWord(pieces[1])];
      if (start != null && end != null) {
        const days = [];
        let d = start;
        for (let i = 0; i < 7; i++) {
          days.push(d);
          if (d === end) break;
          d = (d + 1) % 7;
        }
        return days;
      }
    }
  }

  const single = DAY_TOKEN_MAP[firstWord(part)];
  return single != null ? [single] : null;
}

/* Interpreta o texto de horário salvo em store_settings.schedule e monta um
   mapa de 7 posições (0=domingo ... 6=sábado) com { open, from, to } (minutos).
   Aceita textos como:
     "Quarta a domingo 17:30 às 23:00"
     "Terça 18:30 às 23:00"
     "Segunda a sexta 08:00 às 18:00"
     "Sábado e domingo 18:00 às 23:30"
     "Segunda e terça fechado"
     "Todos os dias 17:30 às 23:00"
   Linhas/segmentos podem ser separados por ";" ou quebra de linha para
   combinar dias com horários diferentes. Retorna null se nada for reconhecido. */
function buildWeekMap(raw) {
  const str = stripAccents(String(raw || '')).toLowerCase().trim();
  if (!str) return null;

  const weekMap = Array.from({ length: 7 }, () => ({ open: false, from: null, to: null }));
  const segments = str.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
  let applied = false;

  for (const seg of segments) {
    const isClosed = /\bfechad[ao]\b/.test(seg);
    const times = seg.match(/\d{1,2}:\d{2}/g) || [];

    let daysPart = seg.replace(/\d{1,2}:\d{2}/g, '');
    daysPart = daysPart.replace(/-feira/g, '');
    daysPart = daysPart.replace(/\b(as|ate|das|de|h|horas|fechad[ao]|aberto)\b/g, ' ');
    const days = parseDayTokens(daysPart);
    if (!days) continue;

    applied = true;
    for (const d of days) {
      if (isClosed || times.length < 2) {
        weekMap[d] = { open: false, from: null, to: null };
      } else {
        weekMap[d] = { open: true, from: toMinutes(times[0]), to: toMinutes(times[1]) };
      }
    }
  }

  return applied ? weekMap : null;
}

function getScheduleRawText() {
  const sch = storeConfig?.schedule;
  return typeof sch === 'string' ? sch : (sch?.text || '');
}

function getWeekMap() {
  return buildWeekMap(getScheduleRawText()) || buildWeekMap(FALLBACK_SCHEDULE_TEXT);
}

/* Retorna o status de funcionamento agora (horário de Brasília), com base no
   schedule informado ou, se omitido, no horário salvo em store_settings. */
function isStoreOpenNow(scheduleText) {
  const weekMap = (scheduleText !== undefined ? buildWeekMap(scheduleText) : null) || getWeekMap();

  const now   = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  false,
  }).formatToParts(now);

  const DAY_MAP = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };
  const weekday = DAY_MAP[parts.find(p => p.type === 'weekday')?.value] ?? 0;
  const hour    = Number(parts.find(p => p.type === 'hour')?.value   ?? 0);
  const minute  = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  const cur     = hour * 60 + minute;

  const today  = weekMap[weekday];
  const isOpen = !!(today.open && today.from != null && today.to != null && cur >= today.from && cur < today.to);

  return {
    isOpen,
    todayLabel: WEEKDAY_NAMES[weekday],
    openTime:   today.from != null ? formatMinutes(today.from) : null,
    closeTime:  today.to   != null ? formatMinutes(today.to)   : null,
    message:    isOpen ? 'Aberto agora' : 'Fechado agora',
    weekMap,
    weekday,
  };
}

function formatDayGroup(days) {
  if (days.length === 1) return WEEKDAY_NAMES[days[0]];
  if (days.length === 2) return `${WEEKDAY_NAMES[days[0]]} e ${WEEKDAY_NAMES[days[1]].toLowerCase()}`;
  return `${WEEKDAY_NAMES[days[0]]} a ${WEEKDAY_NAMES[days[days.length - 1]].toLowerCase()}`;
}

/* Agrupa dias consecutivos (começando na segunda-feira) que tenham o mesmo
   status/horário, para exibição no menu lateral. */
function groupScheduleRows(weekMap) {
  const rows = [];
  let i = 0;
  while (i < 7) {
    const dayIdx = MONDAY_FIRST_ORDER[i];
    const cur    = weekMap[dayIdx];
    const days   = [dayIdx];
    let j = i + 1;
    while (j < 7) {
      const nextIdx = MONDAY_FIRST_ORDER[j];
      const next    = weekMap[nextIdx];
      if (next.open !== cur.open || next.from !== cur.from || next.to !== cur.to) break;
      days.push(nextIdx);
      j++;
    }
    rows.push({
      label:     formatDayGroup(days),
      open:      cur.open,
      timeLabel: cur.open ? `${formatMinutes(cur.from)} – ${formatMinutes(cur.to)}` : 'Fechado',
    });
    i = j;
  }
  return rows;
}

async function loadStoreConfig() {
  try {
    const sb = getSb();
    if (!sb) { storeConfig = {}; return; }
    const { data, error } = await sb.from('store_settings').select('*').eq('id', 'store').single();
    storeConfig = (!error && data) ? data : {};
  } catch (e) {
    storeConfig = {};
  }
}

function getStoreStatus() {
  return isStoreOpenNow();
}

function updateStoreStatus() {
  const status = isStoreOpenNow();
  const { isOpen, weekMap, closeTime } = status;

  const banner  = el('store-status-banner');
  const badge   = el('menu-status-badge');
  const txt     = el('menu-status-text');
  const rowsEl  = el('menu-hours-rows');
  const modalHoursEl = el('closed-modal-hours');

  const rows      = groupScheduleRows(weekMap);
  const openRows  = rows.filter(r => r.open);
  const openSummary = openRows
    .map(r => `${r.label} das ${r.timeLabel.replace(' – ', ' às ')}`)
    .join('; ');

  if (banner) {
    banner.style.display = 'flex';
    banner.className = 'store-banner ' + (isOpen ? 'open' : 'closed');
    banner.innerHTML = isOpen
      ? `<i class="fas fa-circle-check store-banner-ico"></i>
         <div class="store-banner-text">
           <strong>Estamos abertos agora</strong>
           <span>Atendimento até às ${closeTime}.</span>
         </div>`
      : `<i class="fas fa-clock store-banner-ico"></i>
         <div class="store-banner-text">
           <strong>Estamos fechados no momento</strong>
           <span>Nosso atendimento: ${openSummary || 'consulte os horários na loja'}.</span>
         </div>`;
  }

  if (badge && txt) {
    badge.className = 'menu-status-badge ' + (isOpen ? 'open' : 'closed');
    txt.textContent = status.message;
  }

  if (rowsEl) {
    rowsEl.innerHTML = rows.map(r => `
      <div class="menu-hours-row">
        <span class="menu-hours-day">${esc(r.label)}</span>
        <span class="${r.open ? 'menu-hours-time-badge' : 'menu-hours-closed-badge'}">${esc(r.timeLabel)}</span>
      </div>`).join('');
  }

  if (modalHoursEl) {
    const next = openRows[0];
    modalHoursEl.innerHTML = next
      ? `<i class="fas fa-clock"></i> ${esc(next.label)}, ${esc(next.timeLabel.replace(' – ', ' às '))}`
      : `<i class="fas fa-clock"></i> Consulte os horários de atendimento`;
  }
}

/* ──────────────────────────────────────────
   MENU DRAWER
────────────────────────────────────────── */
function toggleMenu() {
  const drawer = el('menu-drawer');
  if (drawer?.classList.contains('open')) closeMenu();
  else openMenu();
}

function openMenu() {
  const drawer  = el('menu-drawer');
  const overlay = el('menu-overlay');
  if (!drawer) return;
  updateStoreStatus();
  drawer.classList.add('open');
  overlay?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMenu() {
  const drawer  = el('menu-drawer');
  const overlay = el('menu-overlay');
  drawer?.classList.remove('open');
  overlay?.classList.remove('open');
  if (!state.cartOpen && !spOpen && !ppProductId) document.body.style.overflow = '';
}

/* ──────────────────────────────────────────
   MODAL: LOJA FECHADA
────────────────────────────────────────── */
function confirmClosedCheckout() {
  const modal = el('closed-modal');
  if (modal) modal.style.display = 'none';
  closeCart();
  navigateTo('delivery');
}

function cancelClosedCheckout() {
  const modal = el('closed-modal');
  if (modal) modal.style.display = 'none';
}
function handleCardImgError(img, icon) {
  const wrap = img.parentNode;
  if (!wrap) return;
  const ph = document.createElement('div');
  ph.className = 'card-img-placeholder';
  ph.innerHTML = `<i class="fas ${icon}"></i><span>Foto em breve</span>`;
  wrap.replaceChild(ph, img);
}

/* ──────────────────────────────────────────
   16. INICIALIZAÇÃO
────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadProductsFromDatabase();
  loadCart();
  refreshCartCount();
  updateCartBar();
  renderProducts();
  initCarousel();
  await loadStoreConfig();
  updateStoreStatus();
  setInterval(updateStoreStatus, 60000);

  /* Abrir produto direto pelo link ?produto=ID (aceita UUID ou id numérico antigo) */
  const _pid = new URLSearchParams(window.location.search).get('produto');
  if (_pid) {
    const _found = findProductByAnyId(_pid);
    if (_found) setTimeout(() => openProductPage(_found.id), 300);
  }

  /* Pre-fill: apenas nome para demonstração */
  setTimeout(() => {
    const fn = el('f-name'); if (fn && !fn.value) fn.value = 'Maria da Silva';
  }, 200);

  /* Keyboard: ESC fecha telas abertas em ordem de prioridade */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (el('troco-modal')?.style.display === 'flex') closeTrocoModal();
      else if (el('pix-page')?.classList.contains('open')) closePixPage();
      else if (ppProductId)         closeProductPage();
      else if (spOpen)              closeSearchPage();
      else if (state.cartOpen)      closeCart();
    }
  });

  console.log('%c🍔 Day Lanches — Cardápio Digital', 'color:#FF6B00;font-size:16px;font-weight:bold;');
  console.log('%cProtótipo demonstrativo • Desenvolvido para apresentação comercial', 'color:#888');
});

/* Expõe funções usadas em onclick do HTML no escopo global */
window.handleOnlinePayment       = handleOnlinePayment;
window.formatPhone               = formatPhone;
window.handleCashPayment       = handleCashPayment;
window.openPixPage             = openPixPage;
window.closePixPage            = closePixPage;
window.copyPixKey              = copyPixKey;
window.sendWhatsAppPixContact  = sendWhatsAppPixContact;
window.openTrocoModal          = openTrocoModal;
window.closeTrocoModal         = closeTrocoModal;
window.closeTrocoModalOutside  = closeTrocoModalOutside;
window.confirmCashPayment      = confirmCashPayment;
window.ppToggleAddon           = ppToggleAddon;
window.ppToggleOption          = ppToggleOption;
window.spChooseProduct         = spChooseProduct;
window.toggleMenu              = toggleMenu;
window.openMenu                = openMenu;
window.closeMenu               = closeMenu;
window.confirmClosedCheckout   = confirmClosedCheckout;
window.cancelClosedCheckout    = cancelClosedCheckout;
window.shareProduct             = shareProduct;
window.shareProductWhatsApp     = shareProductWhatsApp;
