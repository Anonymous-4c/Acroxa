import { header }   from "./acrx/header.js";
import { footer }   from "./acrx/footer.js";
import { sidebar }  from "./acrx/sidebar.js";
import { homepage } from "./acrx/homepage.js";
import { post }     from "./acrx/post.js";
import { page }     from "./acrx/page.js";
import { category } from "./acrx/category.js";
import { error404 } from "./acrx/404.js";

export const layouts = {
    header,
    footer,
    sidebar,
    homepage,
    post,
    page,
    category,
    "404": error404
};