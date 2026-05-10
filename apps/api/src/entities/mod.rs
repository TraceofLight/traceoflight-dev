pub mod admin_credential;
pub mod enums;
pub mod media_asset;
pub mod post;
pub mod post_comment;
pub mod post_slug_redirect;
pub mod post_tag;
pub mod project_profile;
pub mod series;
pub mod series_post;
pub mod series_slug_redirect;
pub mod site_profile;
pub mod tag;

pub mod prelude {
    pub use super::admin_credential::Entity as AdminCredential;
    pub use super::media_asset::Entity as MediaAsset;
    pub use super::post::Entity as Post;
    pub use super::post_comment::Entity as PostComment;
    pub use super::post_slug_redirect::Entity as PostSlugRedirect;
    pub use super::post_tag::Entity as PostTag;
    pub use super::project_profile::Entity as ProjectProfile;
    pub use super::series::Entity as Series;
    pub use super::series_post::Entity as SeriesPost;
    pub use super::series_slug_redirect::Entity as SeriesSlugRedirect;
    pub use super::site_profile::Entity as SiteProfile;
    pub use super::tag::Entity as Tag;
}

#[cfg(test)]
mod tests {
    use sea_orm::{EntityTrait, Related};

    use super::*;

    fn assert_related<L, R>()
    where
        L: EntityTrait + Related<R>,
        R: EntityTrait,
    {
    }

    #[test]
    fn declares_object_graph_relations_for_loader_queries() {
        assert_related::<post::Entity, tag::Entity>();
        assert_related::<tag::Entity, post::Entity>();
        assert_related::<post::Entity, post_comment::Entity>();
        assert_related::<post::Entity, project_profile::Entity>();
        assert_related::<post::Entity, series::Entity>();
        assert_related::<series::Entity, post::Entity>();
        assert_related::<series::Entity, series_post::Entity>();
    }
}
