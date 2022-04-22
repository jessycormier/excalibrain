import { App, TFile } from "obsidian";
import NeuroGraph from "src/main";
import { getDVFieldLinksForPage } from "src/utils/dataview";
import { log } from "src/utils/logging";
import { Page, Relation, RelationType } from "./Page";

export class Pages {
  private pages = new Map<string,Page>();
  private app: App;
  private plugin: NeuroGraph;

  constructor (plugin: NeuroGraph) {
    this.app = plugin.app;
    this.plugin = plugin;
  }

  public add(path: string, page: Page) {
    this.pages.set(path,page);
  }

  public get(path:string): Page {
    return this.pages.get(path);
  }

  public forEach = this.pages.forEach.bind(this.pages);
  public size = this.pages.size;

  public delete(toBeDeletedPath:string) {
    const page = this.pages.get(toBeDeletedPath);
    if(!page) return;
    page.neighbours.forEach((relation:Relation, neighbourPath:string) => {
      const p = this.pages.get(neighbourPath);
      if(!p) return;
      p.unlinkNeighbour(toBeDeletedPath);
      //if neighbor is an unresolved link and no other files link to this unresolved links
      if(!p.file && p.neighbours.size === 0) {
        this.pages.delete(neighbourPath);
      }
    })
    this.pages.delete(toBeDeletedPath);
  }

  public addWithConnections(file:TFile) {
    const page = new Page(file.path,file);
    this.add(file.path, page);

    const backlinksSet = new Set(
      //@ts-ignore
      Object.keys((app.metadataCache.getBacklinksForFile(file)?.data)??{})
      .map(l=>app.metadataCache.getFirstLinkpathDest(l,file.path)?.path??l)
    );

    backlinksSet.forEach(link=>{
      const parent = this.pages.get(link);
      if(!link) {
        log(`Unexpected: ${page.file.path} is referenced from ${link} as backlink in metadataCache, but page for ${link} has not yet been registered in NeuroGraph index.`);
        return;
      }
      parent.addChild(page,RelationType.INFERRED);
      page.addParent(parent,RelationType.INFERRED);
    })
    
    this.addUnresolvedLinks(page);
    this.addResolvedLinks(page);
    this.addDVFieldLinksToPage(page);
  }

  public addResolvedLinks(page?: Page) {
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    Object.keys(resolvedLinks).forEach(parentPath=>{
      if(page && page.path !== parentPath) {
        return;
      }
      Object.keys(resolvedLinks[parentPath]).forEach(childPath=>{
        const child = this.pages.get(childPath);
        const parent = this.pages.get(parentPath);
        child.addParent(parent,RelationType.INFERRED);
        parent.addChild(child,RelationType.INFERRED);
      })
    }); 
  }

  public addUnresolvedLinks(page?:Page) {
    const unresolvedLinks = this.app.metadataCache.unresolvedLinks;
    Object.keys(unresolvedLinks).forEach(parentPath=>{
      if(page && page.path !== parentPath) {
        return;
      }
      Object.keys(unresolvedLinks[parentPath]).forEach(childPath=>{
        const newPage = new Page(childPath,null);
        const parent = this.pages.get(parentPath);
        this.add(childPath,page);
        newPage.addParent(parent,RelationType.INFERRED);
        parent.addChild(newPage,RelationType.INFERRED);
      })
    });
  }

  public addDVFieldLinksToPage(page: Page) {
    const parentFields = this.plugin.settings.hierarchy.parents;
    getDVFieldLinksForPage(this.plugin,page,parentFields).forEach(item=>{
      const referencedPage = this.pages.get(item.link);
      if(!referencedPage) {
        log(`Unexpected: ${page.file.path} references ${item.link} in DV, but it was not found in app.metadataCache. The page was skipped.`);
        return;
      }
      page.addParent(referencedPage,RelationType.DEFINED,item.field);
      referencedPage.addChild(page,RelationType.DEFINED,item.field);
    });
    const childFields = this.plugin.settings.hierarchy.children;
    getDVFieldLinksForPage(this.plugin,page,childFields).forEach(item=>{
      const referencedPage = this.pages.get(item.link);
      if(!referencedPage) {
        log(`Unexpected: ${page.file.path} references ${item.link} in DV, but it was not found in app.metadataCache. The page was skipped.`);
        return;
      }        
      page.addChild(referencedPage,RelationType.DEFINED,item.field);
      referencedPage.addParent(page,RelationType.DEFINED,item.field);
    });
    const friendFields = this.plugin.settings.hierarchy.friends;
    getDVFieldLinksForPage(this.plugin,page,friendFields).forEach(item=>{
      const referencedPage = this.pages.get(item.link);
      if(!referencedPage) {
        log(`Unexpected: ${page.file.path} references ${item.link} in DV, but it was not found in app.metadataCache. The page was skipped.`);
        return;
      }        
      page.addFriend(referencedPage,RelationType.DEFINED,item.field);
      referencedPage.addFriend(page,RelationType.DEFINED,item.field);
    });     
  }
}